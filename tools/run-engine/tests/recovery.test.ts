import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject, parseRecord, schemas } from "voidra";
import {
  commitResult,
  finalizeResult,
  heartbeat,
  prepareResult,
  recoverRun,
  runContext,
  startRun,
} from "../src/run.ts";
import { fixture, report } from "./helpers.ts";

for (const point of [
  "before-commit",
  "after-commit",
  "before-finalize",
  "after-finalize",
] as const)
  it(`recovers ${point} interruption without a duplicate commit`, async () => {
    const root = await fixture(),
      owner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
        stdio: "ignore",
      });
    try {
      if (!owner.pid) throw new Error("Missing owner process");
      const ctx = await startRun(root, "codex", owner.pid);
      if (!ctx) throw new Error("Expected run");
      await writeFile(
        join(root, "README.md"),
        "# Fixture\n\nInstall dependencies.\n",
      );
      await prepareResult(root, ctx.ownerToken, report);
      const options = {
        checkpoint(checkpoint: string) {
          if (checkpoint === point) throw new Error("Interrupted");
        },
      };
      if (point === "before-finalize" || point === "after-finalize") {
        await commitResult(root, ctx.ownerToken, "Document installation");
        await expect(
          finalizeResult(root, ctx.ownerToken, options),
        ).rejects.toThrow("Interrupted");
      } else
        await expect(
          commitResult(root, ctx.ownerToken, "Document installation", options),
        ).rejects.toThrow("Interrupted");
      const exited = once(owner, "exit");
      owner.kill("SIGKILL");
      await exited;
      const recovered = await recoverRun(root, ctx.run);
      expect(await recoverRun(root, ctx.run)).toEqual(recovered);
      expect((await checkProject(root)).diagnostics).toEqual([]);
      const action = schemas.action.parse(
        parseRecord(ctx.actionPath, await readFile(join(root, ctx.actionPath)))
          .data,
      );
      if (point === "before-commit") {
        expect(recovered.phase).toBe("interrupted");
        expect(action).toMatchObject({ stage: "implement", status: "failed" });
      } else {
        expect(recovered.phase).toBe("finalized");
        expect(action).toMatchObject({ stage: "review", status: "waiting" });
      }
      expect(
        execFileSync("git", ["rev-list", "--count", "HEAD"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ).toBe(point === "before-commit" ? "1" : "2");
      expect(await readFile(join(root, "README.md"), "utf8")).toContain(
        "Install dependencies.",
      );
    } finally {
      owner.kill();
      await rm(root, { recursive: true, force: true });
    }
  });
it("recovery preserves outside implementation edits and missing locks keep consumption evidence", async () => {
  const root = await fixture(),
    owner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
    });
  try {
    if (!owner.pid) throw new Error("Missing owner");
    const ctx = await startRun(root, "codex", owner.pid);
    if (!ctx) throw new Error("Expected run");
    await writeFile(join(root, "README.md"), "Agent text.\n");
    await prepareResult(root, ctx.ownerToken, report);
    await commitResult(root, ctx.ownerToken, "Docs");
    const exited = once(owner, "exit");
    owner.kill("SIGKILL");
    await exited;
    await writeFile(join(root, "README.md"), "Outside text.\n");
    await expect(recoverRun(root, ctx.run)).rejects.toThrow(/changed|conflict/);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe(
      "Outside text.\n",
    );
    expect((await runContext(root, ctx.run)).phase).toBe("committed");
  } finally {
    owner.kill();
    await rm(root, { recursive: true, force: true });
  }
  const other = await fixture(),
    otherOwner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
    });
  try {
    if (!otherOwner.pid) throw new Error("Missing owner");
    const ctx = await startRun(other, "codex", otherOwner.pid);
    if (!ctx) throw new Error("Expected run");
    await rm(join(other, ".voidra/local/run.lock"));
    await expect(recoverRun(other, ctx.run)).rejects.toThrow("still alive");
    const exited = once(otherOwner, "exit");
    otherOwner.kill("SIGKILL");
    await exited;
    const recovered = await recoverRun(other, ctx.run, {
      checkpoint: async (point) => {
        if (point === "recovery-owned")
          await expect(heartbeat(other, ctx.ownerToken)).rejects.toThrow(
            "token",
          );
      },
    });
    expect(recovered.ownerToken).not.toBe(ctx.ownerToken);
    expect(recovered.phase).toBe("interrupted");
    const record = (await checkProject(other)).records.get(ctx.runPath);
    expect(record?.document.data.consumedRecords).toContain("act-000000");
  } finally {
    otherOwner.kill();
    await rm(other, { recursive: true, force: true });
  }
});

it("hashes binary implementation bytes and refuses altered checkpoints or unsafe commit paths", async () => {
  const root = await fixture();
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    for (const path of [
      "../outside",
      ".git/config",
      ".voidra/local/secret",
      ".voidra/actions/act-999999/action.md",
    ]) {
      await expect(
        prepareResult(root, ctx.ownerToken, { ...report, paths: [path] }),
      ).rejects.toThrow(/path|another action/);
    }
    await writeFile(join(root, "README.md"), "Docs.\n");
    await writeFile(join(root, "asset.bin"), Buffer.from([255]));
    await prepareResult(root, ctx.ownerToken, {
      ...report,
      paths: ["README.md", "asset.bin"],
    });
    await writeFile(join(root, "asset.bin"), Buffer.from([254]));
    await expect(commitResult(root, ctx.ownerToken, "Docs")).rejects.toThrow(
      /changed/,
    );
    await expect(runContext(root, "../outside")).rejects.toThrow(
      "Invalid run ID",
    );
    await expect(runContext(root, "run-999999")).rejects.toThrow("not found");
    const path = join(root, `.voidra/local/run-checkpoints/${ctx.run}.json`),
      value = JSON.parse(await readFile(path, "utf8"));
    await writeFile(
      path,
      JSON.stringify({ ...value, actionPath: "../outside" }),
    );
    await expect(runContext(root, ctx.run)).rejects.toThrow(/identity/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
