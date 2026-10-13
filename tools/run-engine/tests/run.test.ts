import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject, parseRecord, schemas } from "voidra";
import {
  commitResult,
  failRun,
  finalizeResult,
  heartbeat,
  prepareResult,
  recoverRun,
  runContext,
  startRun,
} from "../src/run.ts";

import { fixture, report } from "./helpers.ts";

it("persists consumption before work, owns one lock, commits once and finishes at Review", async () => {
  const root = await fixture();
  try {
    const start = await startRun(root, "codex", process.pid);
    expect(start).not.toBeNull();
    if (!start) throw new Error("Expected a queued run");
    const ctx = start;
    const inspection = await checkProject(root);
    expect(inspection.diagnostics).toEqual([]);
    const run = [...inspection.records.values()].find((r) => r.kind === "run");
    expect(schemas.run.parse(run?.document.data).consumedRecords).toContain(
      "act-000000",
    );
    await expect(startRun(root, "claude-code", process.pid)).rejects.toThrow(
      /lock|owner|running/i,
    );
    await expect(heartbeat(root, "wrong-token")).rejects.toThrow(
      /owner|token/i,
    );
    await heartbeat(root, ctx.ownerToken);
    await writeFile(
      join(root, "README.md"),
      "# Fixture\n\nInstall the dependencies.\n",
    );
    await prepareResult(root, ctx.ownerToken, report);
    expect((await runContext(root, ctx.run)).phase).toBe("prepared");
    const commit = await commitResult(
      root,
      ctx.ownerToken,
      "Document installation",
    );
    expect(
      execFileSync("git", ["show", "-s", "--format=%B", commit], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toContain(`Voidra-Run: ${ctx.run}`);
    expect(
      await commitResult(root, ctx.ownerToken, "Document installation"),
    ).toBe(commit);
    await finalizeResult(root, ctx.ownerToken);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    const clone = join(root, "fresh-clone");
    execFileSync("git", ["clone", "--quiet", root, clone]);
    expect((await checkProject(clone)).diagnostics).toEqual([]);
    expect(
      (await checkProject(clone)).files.has(".voidra/local/pending-actions.md"),
    ).toBe(false);
    const action = schemas.action.parse(
      parseRecord(
        ".voidra/actions/act-000000/action.md",
        await readFile(join(root, ".voidra/actions/act-000000/action.md")),
      ).data,
    );
    expect(action).toMatchObject({
      stage: "review",
      status: "waiting",
      commits: [commit],
    });
    expect(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("2");
    await expect(
      readFile(join(root, ".voidra/local/run.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("records unsupported work and failures without a commit or advancing the action", async () => {
  const root = await fixture("release");
  try {
    const result = await startRun(root, "claude-code", process.pid);
    expect(result?.phase).toBe("unsupported");
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const docs = await fixture();
  try {
    const ctx = await startRun(docs, "codex", process.pid);
    if (!ctx) throw new Error("Expected queued docs");
    await failRun(docs, ctx.ownerToken, "The documentation check failed.");
    const checked = await checkProject(docs);
    expect(checked.diagnostics).toEqual([]);
    expect(
      checked.records.get(".voidra/actions/act-000000/action.md")?.document
        .data,
    ).toMatchObject({ stage: "implement", status: "failed" });
  } finally {
    await rm(docs, { recursive: true, force: true });
  }
});
it("refuses live-owner recovery, keeps ownership loss from writing and preserves outside edits", async () => {
  const root = await fixture();
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected queued docs");
    await expect(recoverRun(root, ctx.run)).rejects.toThrow(
      /alive|active|owner/i,
    );
    const path = ".voidra/local/run.lock",
      bytes = await readFile(join(root, path));
    await writeFile(
      join(root, path),
      JSON.stringify({
        ...JSON.parse(bytes.toString()),
        ownerToken: "replaced",
      }),
    );
    await expect(heartbeat(root, ctx.ownerToken)).rejects.toThrow(
      /token|owner/i,
    );
    await writeFile(join(root, path), bytes);
    await writeFile(join(root, "README.md"), "# Fixture\nChanged by agent.\n");
    await prepareResult(root, ctx.ownerToken, report);
    await writeFile(
      join(root, ".voidra/actions/act-000000/action.md"),
      "outside edit",
    );
    await expect(commitResult(root, ctx.ownerToken, "Docs")).rejects.toThrow(
      /changed|conflict|invalid/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
