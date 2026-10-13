import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTemplate } from "voidra";
import { z } from "zod";
import { initializeExisting } from "./init.ts";

declare const __voidraIntakeTemplates: string | undefined;
const input = z.strictObject({
  name: z.string().min(1),
  answers: z.record(
    z.string(),
    z.strictObject({ value: z.json(), source: z.string().min(1) }),
  ),
  glossary: z.string().min(1),
});
export async function runIntake(
  args: string[],
  stdin: string,
  cwd = process.cwd(),
): Promise<{ code: number; value: unknown }> {
  try {
    if (args[0] === "--help")
      return {
        code: 0,
        value:
          "voidra-init: JSON input on stdin, or --report FILE; optional --project FOLDER and --template ID. Creates inferred profile, glossary draft and instruction pointers; never commits.",
      };
    const flags = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index],
        value = args[index + 1];
      if (
        !key ||
        !["--project", "--template", "--report"].includes(key) ||
        !value ||
        flags.has(key)
      )
        throw new Error("Use unique --project, --template and --report flags");
      flags.set(key, value);
    }
    const root = resolve(cwd, flags.get("--project") ?? "."),
      templateId = flags.get("--template") ?? "general";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId))
      throw new Error("Invalid template ID");
    const directory =
      typeof __voidraIntakeTemplates !== "undefined"
        ? __voidraIntakeTemplates
        : fileURLToPath(
            new URL(
              "../../../skills/voidra-init/references/templates/",
              import.meta.url,
            ),
          );
    const template = await loadTemplate(
      join(directory, templateId, "template.yaml"),
    );
    const raw = flags.has("--report")
      ? await readFile(resolve(root, flags.get("--report") as string), "utf8")
      : stdin;
    const result = await initializeExisting(
      root,
      template,
      input.parse(JSON.parse(raw)),
    );
    return { code: 0, value: { ok: true, ...result } };
  } catch (error) {
    return {
      code: 1,
      value: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
