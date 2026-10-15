import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  checkProject,
  createAction,
  editAction,
  enableActionSequence,
  enableTaskTracking,
  hash,
  previewActionSequence,
  previewTaskTracking,
  queueDecision,
  readActionSequence,
  schemas,
} from "voidra";
import { failRun, startRun } from "../src/run.ts";
import { fixture } from "./helpers.ts";

for (const agent of ["claude-code", "codex"] as const)
  it(`ordered intent skips blocked tokens and never silently retries consumed work (${agent} adapter)`, async () => {
    const root = await fixture();
    try {
      await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
      await enableTaskTracking(root, {
        revision: (await previewTaskTracking(root)).revision,
      });
      const dep = await createAction(root, {
        type: "docs",
        title: "Prerequisite",
        description: "First",
        by: "You",
      });
      let project = await checkProject(root);
      await editAction(root, {
        id: "act-000000",
        revision: hash(
          project.files.get(".voidra/actions/act-000000/action.md") ?? "",
        ),
        blockedBy: [dep],
      });
      await enableActionSequence(root, {
        revision: (await previewActionSequence(root)).revision,
        by: "You",
      });
      project = await checkProject(root);
      expect(readActionSequence(project).order[0]).toBe("act-000000");
      expect(queueDecision(project, "act-000000").allowed).toBe(false);
      const run = await startRun(root, agent, process.pid);
      if (!run) throw Error("Missing eligible prerequisite run");
      expect(run.action).toBe(dep);
      project = await checkProject(root);
      const sequence = readActionSequence(project);
      expect(sequence.order).toContain(dep);
      expect(sequence.pending).not.toContain(dep);
      expect(sequence.pending).toContain("act-000000");
      const record = [...project.records.values()].find(
        (record) =>
          record.kind === "run" && record.document.data.action === dep,
      );
      expect(
        schemas.run.parse(record?.document.data).orderedIntent,
      ).toMatchObject({
        version: 1,
        revision: expect.any(String),
        queueRevision: expect.any(String),
      });
      await failRun(root, run.ownerToken, "Intent verification stop");
      const bytes = await readFile(
        join(root, ".voidra/local/pending-actions.md"),
      );
      expect(await startRun(root, agent, process.pid)).toBeNull();
      expect(
        await readFile(join(root, ".voidra/local/pending-actions.md")),
      ).toEqual(bytes);
      expect((await checkProject(root)).diagnostics).toEqual([]);
      for (const args of [
        ["add", ".voidra"],
        ["commit", "-qm", "Record intent run"],
      ])
        execFileSync("git", args, { cwd: root });
      const clone = join(root, "fresh-clone");
      execFileSync("git", ["clone", "-q", root, clone]);
      expect((await checkProject(clone)).diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
