import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { runRuntime } from "../src/runtime.ts";
import { fixture, report } from "./helpers.ts";

it("runs the command boundary, reports usage errors and executes the generated standalone helper", async () => {
  expect((await runRuntime(["help"])).code).toBe(0);
  for (const args of [
    [],
    ["bad"],
    ["start", "--agent"],
    ["help", "--nope", "true"],
    ["start", "--agent", "bad"],
    ["start", "--agent", "codex", "--owner-pid", "0"],
    ["inspect"],
    ["help", "--agent", "codex", "--agent", "codex"],
  ])
    expect((await runRuntime(args)).code).toBe(1);
  const root = await fixture();
  try {
    const started = await runRuntime(
      ["start", "--agent", "codex", "--owner-pid", String(process.pid)],
      root,
    );
    expect(started.code).toBe(0);
    const ctx = started.value as { ownerToken: string; run: string };
    expect((await runRuntime(["inspect", "--run", ctx.run], root)).code).toBe(
      0,
    );
    expect(
      (await runRuntime(["heartbeat", "--token", ctx.ownerToken], root)).code,
    ).toBe(0);
    await writeFile(join(root, "README.md"), "# Fixture\nDocs updated.\n");
    const reportFile = join(root, ".voidra/local/report.json");
    await writeFile(reportFile, JSON.stringify(report));
    expect(
      (
        await runRuntime(
          ["prepare", "--token", ctx.ownerToken, "--report", reportFile],
          root,
        )
      ).code,
    ).toBe(0);
    expect(
      (
        await runRuntime(
          [
            "commit",
            "--token",
            ctx.ownerToken,
            "--message",
            "Document installation",
          ],
          root,
        )
      ).code,
    ).toBe(0);
    expect(
      (await runRuntime(["finalize", "--token", ctx.ownerToken], root)).code,
    ).toBe(0);
    expect((await runRuntime(["recover", "--run", ctx.run], root)).code).toBe(
      0,
    );
    expect(await readFile(join(root, "README.md"), "utf8")).toContain(
      "Docs updated.",
    );
    expect(
      (
        await runRuntime(
          ["start", "--agent", "codex", "--owner-pid", String(process.pid)],
          root,
        )
      ).value,
    ).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const other = await fixture();
  try {
    const start = await runRuntime(
      ["start", "--agent", "codex", "--owner-pid", String(process.pid)],
      other,
    );
    const token = (start.value as { ownerToken: string }).ownerToken;
    expect(
      (
        await runRuntime(
          ["fail", "--token", token, "--summary", "Check failed"],
          other,
        )
      ).code,
    ).toBe(0);
  } finally {
    await rm(other, { recursive: true, force: true });
  }
  const output = execFileSync(
    process.execPath,
    [resolve("skills/voidra-go/scripts/runtime.mjs"), "help"],
    { encoding: "utf8" },
  );
  expect(JSON.parse(output)).toContain("start --agent");
});
