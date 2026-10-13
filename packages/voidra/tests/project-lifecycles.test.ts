import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  applyOperation,
  checkProject,
  createAction,
  decideReview,
  hash,
  reviewRevision,
  serializeRecord,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";
import { markdown, samples, time } from "./samples.ts";

it("honors validated project lifecycle overrides at creation and disk review, and rejects removed gates", async () => {
  const files = minimalFiles(),
    meta = JSON.parse(files.get(".voidra/voidra.json")?.toString() ?? "{}");
  meta.requiredVoidra = "0.2.0";
  meta.lifecycleOverrides = {
    docs: {
      stages: ["discovery", "implement", "review", "done"],
      planGate: false,
      rejectTo: "discovery",
    },
  };
  files.set(".voidra/voidra.json", Buffer.from(JSON.stringify(meta)));
  const root = await materialize(files);
  try {
    const id = await createAction(root, {
      type: "docs",
      title: "Docs",
      description: "Clarify installation",
      by: "You",
    });
    let project = await checkProject(root);
    const path = `.voidra/actions/${id}/action.md`,
      doc = project.records.get(path)?.document;
    if (!doc) throw new Error("Missing action");
    expect(doc.data.stage).toBe("discovery");
    await applyOperation(root, {
      changes: [
        {
          path,
          expectedHash: hash(doc.raw),
          content: serializeRecord(doc, {
            ...doc.data,
            stage: "review",
            status: "waiting",
          }).toString(),
        },
        {
          path: `.voidra/actions/${id}/runs/test-codex-run-000000.md`,
          expectedHash: null,
          content: markdown({
            ...samples.run,
            action: id,
            consumedRecords: [id],
            outcome: "advanced",
            endedAt: time,
            toStage: "review",
            commit: "abc123",
          }),
        },
      ],
    });
    project = await checkProject(root);
    await decideReview(
      root,
      id,
      reviewRevision(project, id),
      "rejected",
      "Clarify scope",
      "You",
    );
    expect(
      (await checkProject(root)).records.get(path)?.document.data.stage,
    ).toBe("discovery");
    const metadataPath = join(root, ".voidra/voidra.json");
    await writeFile(
      metadataPath,
      JSON.stringify({
        ...meta,
        lifecycleOverrides: {
          feature: {
            stages: ["implement", "review", "done"],
            planGate: false,
            rejectTo: "implement",
          },
        },
      }),
    );
    expect((await checkProject(root)).diagnostics.map((d) => d.code)).toContain(
      "lifecycle",
    );
    await expect(
      createAction(root, {
        type: "feature",
        title: "Unsafe",
        description: "Bypass plan",
        by: "You",
      }),
    ).rejects.toThrow(/Fix/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("keeps terminal human answers as history", async () => {
  const root = await materialize(minimalFiles());
  try {
    const id = await createAction(root, {
        type: "docs",
        doneBy: "you",
        steps: ["Confirm account"],
        title: "Account",
        description: "Complete account setup",
        by: "You",
      }),
      path = `.voidra/actions/${id}/action.md`,
      project = await checkProject(root),
      doc = project.records.get(path)?.document;
    if (!doc) throw new Error("Missing action");
    const qpath = `.voidra/actions/${id}/questions.md`;
    await applyOperation(root, {
      changes: [
        {
          path,
          expectedHash: hash(doc.raw),
          content: serializeRecord(doc, {
            ...doc.data,
            status: "complete",
            steps: [{ id: "step-1", title: "Confirm account", done: true }],
          }).toString(),
        },
        {
          path: qpath,
          expectedHash: null,
          content: markdown({ ...samples.questions, action: id }),
        },
      ],
    });
    const { answerQuestion } = await import("../src/index.ts");
    await expect(
      answerQuestion(root, {
        action: id,
        question: "q-000000",
        revision: hash(await readFile(join(root, qpath))),
        by: "You",
        answer: { kind: "text", text: "Changed history" },
      }),
    ).rejects.toThrow(/history/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
