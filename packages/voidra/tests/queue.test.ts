import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  checkProject,
  createAction,
  hash,
  inspectFiles,
  queueDecision,
  replaceActionQueue,
  serializeRecord,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("persists exact queue ordering with revision checks and rejects human, blocked and unactivated work", async () => {
  const root = await materialize(minimalFiles());
  const first = await createAction(root, {
    type: "docs",
    title: "First",
    description: "First outcome",
    by: "You",
  });
  const second = await createAction(root, {
    type: "docs",
    title: "Second",
    description: "Second outcome",
    by: "You",
  });
  const human = await createAction(root, {
    type: "docs",
    title: "Human",
    description: "Confirm access",
    by: "You",
    doneBy: "you",
    steps: ["Confirm access"],
  });
  let project = await checkProject(root);
  expect(queueDecision(project, first)).toEqual({
    allowed: true,
    reason: null,
  });
  expect(queueDecision(project, human).allowed).toBe(false);
  expect(queueDecision(project, "act-999999").allowed).toBe(false);
  await replaceActionQueue(root, {
    ids: [second, first],
    revision: null,
    by: "You",
  });
  project = await checkProject(root);
  const path = ".voidra/local/pending-actions.md",
    doc = project.records.get(path)?.document;
  if (!doc) throw new Error("Missing queue");
  expect(doc.body.indexOf(second)).toBeLessThan(doc.body.indexOf(first));
  await expect(
    replaceActionQueue(root, { ids: [first], revision: null, by: "You" }),
  ).rejects.toThrow("changed");
  await replaceActionQueue(root, {
    ids: [first, second],
    revision: hash(doc.raw),
    by: "You",
  });
  await expect(
    replaceActionQueue(root, {
      ids: [first, first],
      revision: null,
      by: "You",
    }),
  ).rejects.toThrow();
  const actionPath = `.voidra/actions/${first}/action.md`,
    action = (await checkProject(root)).records.get(actionPath)?.document;
  if (!action) throw new Error("Missing action");
  const { applyOperation } = await import("../src/index.ts");
  await applyOperation(root, {
    changes: [
      {
        path: actionPath,
        expectedHash: hash(action.raw),
        content: serializeRecord(action, {
          ...action.data,
          blockedBy: [human],
        }).toString(),
      },
    ],
  });
  expect(queueDecision(await checkProject(root), first).reason).toMatch(
    /blocking/,
  );
});

it("requires the displayed action bytes and refuses a run starting during a queue edit", async () => {
  const root = await materialize();
  const project = await checkProject(root),
    path = ".voidra/actions/act-000000/action.md";
  await expect(
    replaceActionQueue(root, {
      ids: ["act-000000"],
      revision: null,
      by: "You",
      revisions: { "act-000000": hash("old") },
    }),
  ).rejects.toThrow(/changed/);
  await expect(
    replaceActionQueue(
      root,
      {
        ids: ["act-000000"],
        revision: null,
        by: "You",
        revisions: { "act-000000": hash(project.files.get(path) ?? "") },
      },
      {
        checkpoint: async (point) => {
          if (point === "validated")
            await writeFile(
              join(root, ".voidra/local/run.lock"),
              "concurrent owner",
            );
        },
      },
    ),
  ).rejects.toThrow();
});

it("explains gate eligibility, delegated questions, child slices and stale plans", async () => {
  const original = (await checkProject(await materialize())).files;
  const path = ".voidra/actions/act-000000/action.md",
    doc = (await checkProject(await materialize())).records.get(path)?.document;
  if (!doc) throw new Error("Missing action");
  const decide = (
    data: Record<string, unknown>,
    extra = new Map<string, Buffer>(),
  ) => {
    const files = new Map(original);
    files.set(
      path,
      Buffer.from(serializeRecord(doc, { ...doc.data, ...data })),
    );
    for (const [key, value] of extra) files.set(key, value);
    return queueDecision(inspectFiles(files), "act-000000");
  };
  expect(decide({ title: null }).reason).toMatch(/fields/);
  expect(
    decide({ type: "profile-change", stage: "discovery", status: "draft" })
      .reason,
  ).toMatch(/activate/);
  expect(decide({ stage: "done", status: "complete" }).allowed).toBe(false);
  expect(decide({ stage: "review", status: "waiting" }).reason).toMatch(
    /human decision/,
  );
  const questionsPath = ".voidra/actions/act-000000/questions.md";
  const q = {
    id: "q-000000",
    text: "Which wording?",
    why: "Set scope",
    options: [],
    allowFreeText: true,
  };
  const questions = (answer?: object) =>
    new Map([
      [
        questionsPath,
        Buffer.from(
          `---\naction: act-000000\nrounds: ${JSON.stringify([{ round: 1, askedAt: "2026-10-13T00:00:00Z", questions: [{ ...q, ...(answer ? { answer } : {}) }] }])}\n---\n`,
        ),
      ],
    ]);
  expect(decide({}, questions()).reason).toMatch(/open questions/);
  expect(
    decide(
      {},
      questions({
        kind: "agent-decides",
        by: "You",
        at: "2026-10-13T00:00:00Z",
      }),
    ).allowed,
  ).toBe(true);
  expect(
    decide(
      { stage: "review", status: "ready" },
      questions({
        kind: "text",
        text: "Short",
        by: "You",
        at: "2026-10-13T00:00:00Z",
      }),
    ).allowed,
  ).toBe(false);
  const childPath = ".voidra/actions/act-000001/action.md";
  expect(
    decide(
      {},
      new Map([
        [
          childPath,
          Buffer.from(
            serializeRecord(doc, {
              ...doc.data,
              id: "act-000001",
              parent: "act-000000",
            }),
          ),
        ],
      ]),
    ).reason,
  ).toMatch(/child slices/);
});
