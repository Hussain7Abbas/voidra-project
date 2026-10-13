import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { processInfo } from "./process.ts";
import {
  commitResult,
  failRun,
  finalizeResult,
  heartbeat,
  prepareResult,
  recoverRun,
  reportSchema,
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
          "voidra-go runtime: start --agent claude-code|codex [--owner-pid PID]; heartbeat --token TOKEN; prepare --token TOKEN --report FILE; commit --token TOKEN --message TEXT; finalize --token TOKEN; fail --token TOKEN --summary TEXT; recover --run RUN; inspect --run RUN. Every command accepts --project FOLDER.",
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
      return { code: 0, value: await startRun(root, agent, pid) };
    }
    if (command === "heartbeat") {
      await heartbeat(root, need("--token"));
      return { code: 0, value: { heartbeat: true } };
    }
    if (command === "prepare") {
      const report = reportSchema.parse(
        JSON.parse(await readFile(resolve(root, need("--report")), "utf8")),
      );
      await prepareResult(root, need("--token"), report);
      return { code: 0, value: { prepared: true } };
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
      return { code: 0, value: await runContext(root, need("--run")) };
    throw new Error("Unknown command; use help");
  } catch (error) {
    return {
      code: 1,
      value: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}
