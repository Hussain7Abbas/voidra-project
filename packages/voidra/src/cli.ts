import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { approveAction, getPlanRevision } from "./approval.ts";
import { VoidraError } from "./errors.ts";
import { createId, type IdPrefix, prefixes } from "./ids.ts";
import { migrateProject } from "./migration.ts";
import { checkProject, PACKAGE_VERSION } from "./project.ts";
import { applyOperation, manifestSchema, recoverOperation } from "./writer.ts";
export interface CliResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}
const help = `Voidra ${PACKAGE_VERSION}\nCommands: check [project] [--json]; version; id <prefix>; plan <action> [--project folder] [--json]; approve <action> --by <actor> --revision <fingerprint> [--project folder] [--json]; apply <manifest.json> [--project folder] [--glossary] [--json]; recover <operation> [--project folder] [--rollback] [--glossary] [--json]; migrate [project] [--dry-run] [--json]\n`;
const configuration: Record<
  string,
  {
    positional: [number, number];
    options: Record<string, "string" | "boolean">;
  }
> = {
  check: { positional: [0, 1], options: { json: "boolean" } },
  version: { positional: [0, 0], options: {} },
  id: { positional: [1, 1], options: {} },
  plan: { positional: [1, 1], options: { project: "string", json: "boolean" } },
  approve: {
    positional: [1, 1],
    options: {
      project: "string",
      by: "string",
      revision: "string",
      json: "boolean",
    },
  },
  apply: {
    positional: [1, 1],
    options: { project: "string", glossary: "boolean", json: "boolean" },
  },
  recover: {
    positional: [1, 1],
    options: {
      project: "string",
      rollback: "boolean",
      glossary: "boolean",
      json: "boolean",
    },
  },
  migrate: {
    positional: [0, 1],
    options: { "dry-run": "boolean", json: "boolean" },
  },
};
export async function runCli(
  args: string[],
  cwd = process.cwd(),
): Promise<CliResult> {
  if (args[0] === "--help" || args[0] === "help")
    return { exitCode: 0, stdout: help, stderr: "" };
  const command = args[0] ?? "";
  const config = configuration[command];
  const usage = (message: string): CliResult => ({
    exitCode: 2,
    stdout: "",
    stderr: `${message}\n${help}`,
  });
  if (!config) return usage("Choose a valid command");
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries(
        Object.entries(config.options).map(([name, type]) => [name, { type }]),
      ),
    });
  } catch (error) {
    return usage((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (
    positionals.length < config.positional[0] ||
    positionals.length > config.positional[1]
  )
    return usage("Incorrect number of arguments");
  if (command === "id" && !prefixes.includes(positionals[0] as IdPrefix))
    return usage("Unknown ID prefix");
  if (
    command === "approve" &&
    (typeof values.by !== "string" ||
      !values.by.trim() ||
      typeof values.revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(values.revision))
  )
    return usage("Approval requires --by and a SHA-256 --revision");
  const json = values.json === true;
  const root = resolve(
    cwd,
    (command === "check" || command === "migrate"
      ? positionals[0]
      : typeof values.project === "string"
        ? values.project
        : undefined) ?? ".",
  );
  const output = (data: unknown, human: string): CliResult => ({
    exitCode: 0,
    stdout: json ? `${JSON.stringify(data, null, 2)}\n` : `${human}\n`,
    stderr: "",
  });
  try {
    if (command === "version")
      return output({ version: PACKAGE_VERSION }, PACKAGE_VERSION);
    if (command === "id") {
      const id = createId(positionals[0] as IdPrefix);
      return output({ id }, id);
    }
    if (command === "check") {
      const checked = await checkProject(root);
      const data = {
        valid: checked.diagnostics.length === 0,
        diagnostics: checked.diagnostics,
      };
      const human = data.valid
        ? "Voidra project is valid"
        : checked.diagnostics
            .map((d) => `${d.file}:${d.line} [${d.field}] ${d.message}`)
            .join("\n");
      const result = output(data, human);
      return { ...result, exitCode: data.valid ? 0 : 1 };
    }
    if (command === "plan") {
      const plan = await getPlanRevision(root, positionals[0] as string);
      return output(plan, plan.revision);
    }
    if (command === "migrate") {
      const migration = await migrateProject(root, {
        dryRun: values["dry-run"] === true,
      });
      return output(
        migration,
        migration.changed
          ? `${migration.dryRun ? "Would migrate" : "Migrated"} format ${migration.from} → ${migration.to}: ${migration.paths.join(", ")}`
          : "Format is current",
      );
    }
    if (command === "approve") {
      const operation = await approveAction(
        root,
        positionals[0] as string,
        values.by as string,
        values.revision as string,
      );
      return output(operation, `Approved ${positionals[0]} (${operation.id})`);
    }
    if (command === "apply") {
      const manifest = manifestSchema.safeParse(
        JSON.parse(
          await readFile(resolve(cwd, positionals[0] as string), "utf8"),
        ),
      );
      if (!manifest.success)
        throw new VoidraError(
          "manifest",
          positionals[0] as string,
          "Invalid write manifest",
        );
      const operation = await applyOperation(root, manifest.data, {
        allowGlossary: values.glossary === true,
      });
      return output(operation, `${operation.id}: ${operation.state}`);
    }
    const operation = await recoverOperation(root, positionals[0] as string, {
      rollback: values.rollback === true,
      allowGlossary: values.glossary === true,
    });
    return output(operation, `${operation.id}: ${operation.state}`);
  } catch (error) {
    const diagnostic =
      error instanceof VoidraError
        ? error.diagnostic()
        : {
            code: "io",
            file: "",
            field: "$",
            line: 1,
            message: (error as Error).message,
          };
    return {
      exitCode: 1,
      stdout: json
        ? `${JSON.stringify({ valid: false, diagnostics: [diagnostic] }, null, 2)}\n`
        : "",
      stderr: json
        ? ""
        : `${diagnostic.file} [${diagnostic.field}] ${diagnostic.message}\n`,
    };
  }
}
