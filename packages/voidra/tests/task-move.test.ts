import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  checkProject,
  createAction,
  createIdea,
  editAction,
  enableTaskTracking,
  hash,
  moveTask,
  previewTaskTracking,
  projectTasks,
  queueDecision,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("fills only missing TODO releases, preserves older assignments and refuses stale moves or lifecycle bypasses", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const id = await createAction(root, {
    type: "docs",
    title: "Assigned",
    description: "**Keep source**",
    by: "You",
  });
  const path = `.voidra/actions/${id}/action.md`;
  const revision = async () => hash(await readFile(join(root, path)));
  const initial = await revision();
  await moveTask(root, { id, revision: initial, column: "backlog" });
  expect(queueDecision(await checkProject(root), id).allowed).toBe(false);
  await expect(
    moveTask(root, { id, revision: initial, column: "todo" }),
  ).rejects.toThrow(/changed|hash/i);
  await writeFile(join(root, "package.json"), '{"version":"2.4.0"}');
  await moveTask(root, { id, revision: await revision(), column: "todo" });
  expect(
    projectTasks(await checkProject(root)).find((t) => t.id === id),
  ).toMatchObject({
    column: "todo",
    targetRelease: "2.3.4",
    stage: "implement",
    status: "ready",
    body: "**Keep source**",
  });
  const before = await readFile(join(root, path));
  for (const column of ["in-progress", "review", "done"] as const)
    await expect(
      moveTask(root, { id, revision: hash(before), column }),
    ).rejects.toThrow(/lifecycle|gate|run/i);
  expect(await readFile(join(root, path))).toEqual(before);
  const unversioned = await createAction(root, {
    type: "feature",
    title: "Later",
    description: "Details",
    by: "You",
    taskColumn: "backlog",
    targetRelease: null,
  });
  const task = projectTasks(await checkProject(root)).find(
    (t) => t.id === unversioned,
  );
  if (!task) throw Error("Missing task");
  await moveTask(root, {
    id: task.id,
    revision: task.revision,
    column: "todo",
  });
  expect(
    projectTasks(await checkProject(root)).find((t) => t.id === unversioned)
      ?.targetRelease,
  ).toBe("2.4.0");
});

it("promotes unversioned ideas through typed TODO movement without duplicate cards and respects blockers", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const id = await createIdea(root, {
    title: "Promote",
    description: "Notes",
    by: "You",
    targetRelease: null,
  });
  const task = projectTasks(await checkProject(root)).find((t) => t.id === id);
  if (!task) throw Error("Missing idea");
  await expect(
    moveTask(root, { id, revision: task.revision, column: "todo" }),
  ).rejects.toThrow(/type/i);
  const promoted = await moveTask(root, {
    id,
    revision: task.revision,
    column: "todo",
    type: "feature",
    by: "You",
  });
  const tasks = projectTasks(await checkProject(root));
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    id: promoted,
    sourceIdea: id,
    targetRelease: "2.3.4",
    column: "todo",
    stage: "discovery",
  });
  const blocker = await createAction(root, {
    type: "docs",
    title: "Blocker",
    description: "Wait",
    by: "You",
  });
  await editAction(root, {
    id: promoted,
    revision: tasks[0]?.revision ?? "",
    blockedBy: [blocker],
  });
  const revision = async () =>
    hash(await readFile(join(root, `.voidra/actions/${promoted}/action.md`)));
  await moveTask(root, {
    id: promoted,
    revision: await revision(),
    column: "backlog",
  });
  await moveTask(root, {
    id: promoted,
    revision: await revision(),
    column: "todo",
  });
  expect(queueDecision(await checkProject(root), promoted)).toMatchObject({
    allowed: false,
    reason: expect.stringMatching(/blocked/),
  });
});

it("requires opt-in and a valid current release for leaving unassigned Backlog", async () => {
  const root = await materialize(minimalFiles());
  const id = await createAction(root, {
    type: "docs",
    title: "Legacy",
    description: "Notes",
    by: "You",
  });
  const path = `.voidra/actions/${id}/action.md`;
  await expect(
    moveTask(root, {
      id,
      revision: hash(await readFile(join(root, path))),
      column: "backlog",
    }),
  ).rejects.toThrow(/tracking|upgrade/i);
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  await writeFile(join(root, "package.json"), "{}");
  const draft = await createAction(root, {
    type: "docs",
    title: "Unassigned",
    description: "Notes",
    by: "You",
  });
  const task = projectTasks(await checkProject(root)).find(
    (t) => t.id === draft,
  );
  if (!task) throw Error("Missing task");
  await expect(
    moveTask(root, { id: draft, revision: task.revision, column: "todo" }),
  ).rejects.toThrow(/release|package/i);
  expect((await checkProject(root)).diagnostics).toEqual([]);
});

it("refuses archived work, drafts and active planning locks while allowing a same-column no-op", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const id = await createAction(root, {
    type: "docs",
    title: "Guarded",
    description: "Details",
    by: "You",
  });
  const path = `.voidra/actions/${id}/action.md`,
    original = await readFile(join(root, path));
  expect(
    await moveTask(root, { id, revision: hash(original), column: "todo" }),
  ).toBe(id);
  expect(await readFile(join(root, path))).toEqual(original);
  await expect(
    moveTask(root, {
      id: "act-000000",
      revision: hash(original),
      column: "todo",
    }),
  ).rejects.toThrow(/not found/);
  const { parseRecord, serializeRecord } = await import("../src/index.ts");
  const doc = parseRecord(path, original);
  await writeFile(
    join(root, path),
    serializeRecord(doc, { ...doc.data, status: "draft" }),
  );
  await expect(
    moveTask(root, {
      id,
      revision: hash(await readFile(join(root, path))),
      column: "todo",
    }),
  ).rejects.toThrow(/draft|gate/);
  await writeFile(join(root, path), original);
  await editAction(root, { id, revision: hash(original), cancel: true });
  await expect(
    moveTask(root, {
      id,
      revision: hash(await readFile(join(root, path))),
      column: "todo",
    }),
  ).rejects.toThrow(/archived/i);
  await writeFile(join(root, path), original);
  await writeFile(join(root, ".voidra/local/planning.lock"), "busy");
  await expect(
    moveTask(root, { id, revision: hash(original), column: "backlog" }),
  ).rejects.toThrow(/planning|pending|conflict/i);
  expect(await readFile(join(root, path))).toEqual(original);
});
