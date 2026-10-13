import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, loadTemplate } from "voidra";

declare const __voidraIntakeTemplates: string | undefined;

import { processInfo } from "./process.ts";
import {
  commitResult,
  failRun,
  finalizeResult,
  guardRun,
  heartbeat,
  prepareResult,
  publishHumanBlocker,
  publishPlanning,
  publishReleasePlan,
  publishResearch,
  type RunContext,
  recoverRun,
  reportSchema,
  resolveDelegatedChoices,
  runContext,
  startRun,
} from "./run.ts";
export async function ownerPid(): Promise<number> {
  let pid = process.ppid;
  for (let depth = 0; depth < 12 && pid > 1; depth++) {
    const info = await processInfo(pid);
    if (!info) break;
    if (info.command === "claude" || info.command === "codex") return pid;
    pid = info.parentPid;
  }
  throw new Error(
    "Could not identify the agent process. Pass --owner-pid with its long-lived PID.",
  );
}
export async function runRuntime(
  args: string[],
  cwd = process.cwd(),
): Promise<{ code: number; value: unknown }> {
  try {
    const [command, ...rest] = args,
      flags = new Map<string, string>();
    for (let i = 0; i < rest.length; i += 2) {
      const key = rest[i],
        value = rest[i + 1];
      if (!key?.startsWith("--") || value === undefined || flags.has(key))
        throw new Error("Use unique --name value flags");
      flags.set(key, value);
    }
    const allowed = new Set([
      "--project",
      "--agent",
      "--owner-pid",
      "--token",
      "--run",
      "--report",
      "--message",
      "--summary",
      "--mode",
    ]);
    for (const key of flags.keys())
      if (!allowed.has(key)) throw new Error(`Unknown flag ${key}`);
    const root = resolve(cwd, flags.get("--project") ?? "."),
      need = (key: string): string => {
        const value = flags.get(key);
        if (!value) throw new Error(`Required ${key}`);
        return value;
      };
    if (command === "help" || command === "--help")
      return {
        code: 0,
        value:
          "voidra-go runtime: start --agent claude-code|codex [--owner-pid PID] [--mode go|plan]; guard --token TOKEN --report FILE; choices|research|human --token TOKEN --report FILE; heartbeat --token TOKEN; planning|release-plan --token TOKEN --report FILE; prepare --token TOKEN --report FILE; commit --token TOKEN --message TEXT; finalize --token TOKEN; fail --token TOKEN --summary TEXT; recover --run RUN; inspect --run RUN. Every command accepts --project FOLDER.",
      };
    if (command === "start") {
      const agent = need("--agent");
      if (agent !== "codex" && agent !== "claude-code")
        throw new Error("Unknown agent");
      const pid = flags.has("--owner-pid")
        ? Number(need("--owner-pid"))
        : await ownerPid();
      if (!Number.isSafeInteger(pid) || pid < 1)
        throw new Error("Invalid owner PID");
      const mode = flags.get("--mode") ?? "go";
      if (mode !== "go" && mode !== "plan") throw new Error("Unknown run mode");
      const project = await checkProject(root);
      const templateId = project.metadata?.template?.id;
      let templateInfo: {
        id: string;
        version: string;
        architectureSkill: string;
        path: string;
      } | null = null;
      if (templateId) {
        const folder =
          typeof __voidraIntakeTemplates === "undefined"
            ? fileURLToPath(new URL("../../../templates/", import.meta.url))
            : __voidraIntakeTemplates;
        const path = resolve(folder, templateId, "template.yaml"),
          template = await loadTemplate(path);
        if (template.version !== project.metadata?.template?.version)
          throw new Error(
            "Installed template version differs from the project",
          );
        templateInfo = {
          id: template.id,
          version: template.version,
          architectureSkill: template.architectureSkill,
          path,
        };
      }
      const ctx = await startRun(root, agent, pid, mode);
      return {
        code: 0,
        value: ctx
          ? { ...(publicContext(ctx) as object), template: templateInfo }
          : null,
      };
    }
    if (command === "heartbeat") {
      await heartbeat(root, need("--token"));
      return { code: 0, value: { heartbeat: true } };
    }
    if (command === "planning") {
      const input = JSON.parse(
        await readFile(resolve(root, need("--report")), "utf8"),
      );
      return {
        code: 0,
        value: publicContext(
          await publishPlanning(root, need("--token"), input),
        ),
      };
    }
    if (["guard", "choices", "research", "human"].includes(command ?? "")) {
      const input = JSON.parse(
          await readFile(resolve(root, need("--report")), "utf8"),
        ),
        token = need("--token");
      if (command === "guard") {
        if (!Array.isArray(input) || !input.every((p) => typeof p === "string"))
          throw new Error("Guard report must be an array of file paths");
        await guardRun(root, token, input);
      } else if (command === "choices")
        await resolveDelegatedChoices(root, token, input);
      else if (command === "research")
        await publishResearch(root, token, input);
      else
        return {
          code: 0,
          value: { human: await publishHumanBlocker(root, token, input) },
        };
      return { code: 0, value: { ok: true } };
    }
    if (command === "prepare") {
      const report = reportSchema.parse(
        JSON.parse(await readFile(resolve(root, need("--report")), "utf8")),
      );
      await prepareResult(root, need("--token"), report);
      return { code: 0, value: { prepared: true } };
    }
    if (command === "release-plan") {
      await publishReleasePlan(
        root,
        need("--token"),
        JSON.parse(await readFile(resolve(root, need("--report")), "utf8")),
      );
      return { code: 0, value: { gate: "review" } };
    }
    if (command === "commit")
      return {
        code: 0,
        value: {
          commit: await commitResult(root, need("--token"), need("--message")),
        },
      };
    if (command === "finalize") {
      await finalizeResult(root, need("--token"));
      return { code: 0, value: { finalized: true } };
    }
    if (command === "fail") {
      await failRun(root, need("--token"), need("--summary"));
      return { code: 0, value: { failed: true } };
    }
    if (command === "recover")
      return { code: 0, value: await recoverRun(root, need("--run")) };
    if (command === "inspect")
      return {
        code: 0,
        value: publicContext(await runContext(root, need("--run"))),
      };
    throw new Error("Unknown command; use help");
  } catch (error) {
    return {
      code: 1,
      value: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

function publicContext(ctx: RunContext | null): unknown {
  if (!ctx) return null;
  const { run, action, agent, phase, ownerToken, actionPath, runPath, mode } =
    ctx;
  return { run, action, agent, phase, ownerToken, actionPath, runPath, mode };
}
