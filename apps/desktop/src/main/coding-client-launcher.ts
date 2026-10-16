import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export async function openCodingClient(
  agent: "codex" | "claude-code",
  root: string | undefined,
  data: string,
  options: {
    platform?: string;
    test?: boolean;
    execute?: (file: string, args: string[]) => Promise<unknown>;
  } = {},
): Promise<void> {
  if (options.test) {
    await mkdir(data, { recursive: true });
    await appendFile(
      join(data, "agent-launches.jsonl"),
      `${JSON.stringify({ agent, root })}\n`,
    );
    return;
  }
  if ((options.platform ?? process.platform) !== "darwin")
    throw Error(
      "The command is copied. Opening coding clients is currently supported on macOS.",
    );
  const run =
    options.execute ??
    ((file, args) => execute(file, args, { timeout: 10000 }));
  try {
    if (agent === "codex")
      await run("/usr/bin/open", ["-a", "Codex", ...(root ? [root] : [])]);
    else {
      const folder = join(data, "agent-launches");
      await mkdir(folder, { recursive: true });
      const script = join(folder, `${randomUUID()}.command`);
      await writeFile(
        script,
        `#!/bin/zsh -l\n${root ? `cd -- ${quote(root)} || exit 1\n` : ""}exec claude\n`,
        { mode: 0o700 },
      );
      await run("/usr/bin/open", ["-a", "Terminal", script]);
    }
  } catch {
    throw Error(
      `The command is copied, but ${agent === "codex" ? "Codex" : "Claude Code"} could not be opened. Check that the selected client is installed.`,
    );
  }
}
