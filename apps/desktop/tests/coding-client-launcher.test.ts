import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openCodingClient } from "../src/main/coding-client-launcher.ts";

it("opens only fixed clients and quotes a project path before starting interactive Claude Code", async () => {
  const data = await mkdtemp(join(tmpdir(), "voidra-client-"));
  const calls: { file: string; args: string[] }[] = [];
  const execute = async (file: string, args: string[]) => {
    calls.push({ file, args });
  };
  try {
    const root = "/tmp/project 'quoted' $(touch never)";
    await openCodingClient("codex", root, data, {
      platform: "darwin",
      execute,
    });
    expect(calls).toEqual([
      { file: "/usr/bin/open", args: ["-a", "Codex", root] },
    ]);
    await openCodingClient("claude-code", root, data, {
      platform: "darwin",
      execute,
    });
    const script = calls[1]?.args[2];
    if (!script) throw Error("Missing script");
    const source = await readFile(script, "utf8");
    expect(source).toContain(
      "cd -- '/tmp/project '\\''quoted'\\'' $(touch never)' || exit 1",
    );
    expect(source).toContain("exec claude\n");
    expect(source).not.toContain("voidra-go");
    expect(calls[1]?.args.slice(0, 2)).toEqual(["-a", "Terminal"]);
    await expect(
      openCodingClient("codex", root, data, {
        platform: "darwin",
        execute: async () => {
          throw Error("missing app");
        },
      }),
    ).rejects.toThrow(/command is copied/);
    await expect(
      openCodingClient("codex", root, data, { platform: "linux", execute }),
    ).rejects.toThrow(/macOS/);
    await openCodingClient("codex", root, data, { test: true });
    expect(
      JSON.parse(await readFile(join(data, "agent-launches.jsonl"), "utf8")),
    ).toEqual({ agent: "codex", root });
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});
