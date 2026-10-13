import { readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject, schemas } from "voidra";
import { listRunContexts, runContext, startRun } from "../src/run.ts";
import { fixture } from "./helpers.ts";

it("allows exactly one owner when local starts compete", async () => {
  const root = await fixture();
  try {
    const results = await Promise.allSettled([
      startRun(root, "codex", process.pid),
      startRun(root, "claude-code", process.pid),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const lock = schemas.lock.parse(
      JSON.parse(await readFile(join(root, ".voidra/local/run.lock"), "utf8")),
    );
    const contexts = await listRunContexts(root);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.ownerToken).toBe(lock.ownerToken);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses linked private checkpoints before reading outside the project", async () => {
  const root = await fixture(),
    outside = await fixture();
  try {
    const ctx = await startRun(outside, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    await symlink(
      join(outside, ".voidra/local/run-checkpoints"),
      join(root, ".voidra/local/run-checkpoints"),
    );
    await expect(listRunContexts(root)).rejects.toThrow(/symlink/);
    await expect(runContext(root, ctx.run)).rejects.toThrow(/symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
