import { rm } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  answerQuestion,
  approveAction,
  checkProject,
  createAction,
  decideReview,
  getPlanRevision,
  reviewRevision,
} from "voidra";
import { minimalFiles } from "../../../packages/voidra/scripts/fixtures.ts";
import { materialize } from "../../../packages/voidra/tests/helpers.ts";
import { publishFakeGate } from "../src/gates.ts";

it("scripts both question rounds, assumptions, plans and review without touching source files", async () => {
  const root = await materialize(minimalFiles());
  try {
    await expect(
      publishFakeGate(root, "act-111111", "questions"),
    ).rejects.toThrow(/missing/);
    const id = await createAction(root, {
      type: "feature",
      title: "Export",
      description: "Export notes",
      by: "You",
    });
    for (let i = 0; i < 2; i++) {
      await publishFakeGate(root, id, "questions");
      const project = await checkProject(root),
        record = project.records.get(
          `.voidra/actions/${id}/questions.md`,
        )?.document;
      if (!record) throw new Error("Question missing");
      const q = (record.data.rounds as { questions: { id: string }[] }[]).at(-1)
        ?.questions[0];
      if (!q || !record) throw new Error("Question missing");
      const { hash } = await import("voidra");
      await answerQuestion(root, {
        action: id,
        question: q.id,
        revision: hash(record.raw),
        by: "You",
        answer: i ? { kind: "agent-decides" } : { kind: "choice", choice: "a" },
      });
    }
    await publishFakeGate(root, id, "assumption");
    await publishFakeGate(root, id, "plan");
    await approveAction(
      root,
      id,
      "You",
      (await getPlanRevision(root, id)).revision,
    );
    await publishFakeGate(root, id, "plan");
    expect(
      (await checkProject(root)).records.get(`.voidra/actions/${id}/action.md`)
        ?.document.data.approvalHistory,
    ).toHaveLength(1);
    await approveAction(
      root,
      id,
      "You",
      (await getPlanRevision(root, id)).revision,
    );
    await publishFakeGate(root, id, "review");
    expect((await checkProject(root)).diagnostics).toEqual([]);
    await decideReview(
      root,
      id,
      reviewRevision(await checkProject(root), id),
      "accepted",
      "",
      "You",
    );
    expect((await checkProject(root)).diagnostics).toEqual([]);
    for (const type of ["research", "release"] as const) {
      const id = await createAction(root, {
        type,
        title: type,
        description: "Scripted gate",
        by: "You",
      });
      if (type === "release") await publishFakeGate(root, id, "plan");
      await publishFakeGate(root, id, "review");
      expect((await checkProject(root)).diagnostics).toEqual([]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
