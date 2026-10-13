import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  checkProject,
  createAction,
  hash,
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
