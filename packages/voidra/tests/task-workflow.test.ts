import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  checkProject,
  createAction,
  enableTaskTracking,
  hash,
  moveTask,
  parseRecord,
  previewTaskTracking,
  projectTasks,
  queueDecision,
  readActionSequence,
  serializeRecord,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("queues Planning and In progress while keeping planned TODO idle, preserving source and exact move revisions", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const id = await createAction(root, {
    title: "Workflow",
    type: "docs",
    description: "Keep **all** context",
    by: "You",
    taskColumn: "backlog",
    taskWorkflow: 1,
  });
  const path = `.voidra/actions/${id}/action.md`;
  const task = async () => {
    const found = projectTasks(await checkProject(root)).find(
      (t) => t.id === id,
    );
    if (!found) throw Error("Missing task");
    return found;
  };
  expect((await task()).column).toBe("backlog");
  await expect(
    moveTask(root, { id, revision: (await task()).revision, column: "todo" }),
  ).rejects.toThrow(/plan/i);
  await moveTask(root, {
    id,
    revision: (await task()).revision,
    column: "planning",
  });
  expect((await task()).column).toBe("planning");
  expect(queueDecision(await checkProject(root), id).allowed).toBe(true);
  expect(readActionSequence(await checkProject(root)).pending).toContain(id);
  const project = await checkProject(root),
    doc = project.records.get(path)?.document;
  if (!doc) throw Error("Missing action");
  await writeFile(
    join(root, path),
    serializeRecord(doc, { ...doc.data, workflowPlanned: true }),
  );
  const qPath = `.voidra/actions/${id}/questions.md`;
  await writeFile(
    join(root, qPath),
    serializeRecord(parseRecord(qPath, "---\n{}\n---\n"), {
      action: id,
      rounds: [
        {
          round: 1,
          askedAt: new Date().toISOString(),
          questions: [
            {
              id: "q-000001",
              text: "Which output?",
              why: "Define the expected behavior",
              options: [
                {
                  label: "a",
                  description: "Document output",
                  recommended: true,
                },
              ],
              allowFreeText: true,
              answer: {
                kind: "choice",
                choice: "a",
                by: "You",
                at: new Date().toISOString(),
              },
            },
          ],
        },
      ],
    }),
  );
  await expect(
    moveTask(root, { id, revision: (await task()).revision, column: "todo" }),
  ).rejects.toThrow(/plan/i);
  for (const [name, body] of Object.entries({
    requirements: "## Goal\nDocument output.\n## Out of scope\nOther changes.",
    blueprint:
      "## Approach\nREADME only.\n## Testing seams\nInspect output.\n## Proposed ADRs\nNone.",
    acceptance: "- Output remains readable.",
  })) {
    const file = `.voidra/actions/${id}/${name}.md`;
    await writeFile(
      join(root, file),
      serializeRecord(
        parseRecord(file, "---\n{}\n---\n"),
        { action: id },
        body,
      ),
    );
  }
  const stale = (await task()).revision;
  await moveTask(root, { id, revision: stale, column: "todo" });
  expect((await task()).column).toBe("todo");
  expect(queueDecision(await checkProject(root), id).allowed).toBe(false);
  expect(readActionSequence(await checkProject(root)).pending).not.toContain(
    id,
  );
  await expect(
    moveTask(root, { id, revision: stale, column: "in-progress" }),
  ).rejects.toThrow(/changed/);
  await moveTask(root, {
    id,
    revision: (await task()).revision,
    column: "in-progress",
  });
  expect((await task()).column).toBe("in-progress");
  expect(readActionSequence(await checkProject(root)).pending).toContain(id);
  expect(queueDecision(await checkProject(root), id).allowed).toBe(true);
  expect(await readFile(join(root, path), "utf8")).toContain(
    "Keep **all** context",
  );
  const before = await readFile(join(root, path));
  await expect(
    moveTask(root, { id, revision: hash(before), column: "done" }),
  ).rejects.toThrow(/QA|result|completion/);
  expect(await readFile(join(root, path))).toEqual(before);
  const review = parseRecord(path, before);
  await writeFile(
    join(root, path),
    serializeRecord(review, {
      ...review.data,
      stage: "review",
      status: "waiting",
    }),
  );
  expect((await task()).column).toBe("review");
  await moveTask(root, {
    id,
    revision: (await task()).revision,
    column: "backlog",
  });
  expect(await task()).toMatchObject({
    column: "backlog",
    stage: "implement",
    targetRelease: "2.3.4",
  });
  expect(readActionSequence(await checkProject(root)).pending).not.toContain(
    id,
  );
  expect((await checkProject(root)).diagnostics).toEqual([]);
});

it("keeps deleted task history reversible, refuses stale deletion and protects unfinished children", async () => {
  const { deleteTask, editAction } = await import("../src/index.ts");
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const parent = await createAction(root, {
    type: "docs",
    title: "Parent",
    description: "History to preserve",
    by: "You",
    taskWorkflow: 1,
    taskColumn: "backlog",
  });
  const child = await createAction(root, {
    type: "docs",
    title: "Child",
    description: "Child history",
    by: "You",
    taskColumn: "backlog",
  });
  const card = async (id: string) => {
    const task = projectTasks(await checkProject(root)).find(
      (task) => task.id === id,
    );
    if (!task) throw Error("Missing task");
    return task;
  };
  await editAction(root, {
    id: child,
    revision: (await card(child)).revision,
    parent,
  });
  await expect(
    deleteTask(root, { id: parent, revision: (await card(parent)).revision }),
  ).rejects.toThrow(/unfinished subtasks/);
  const before = await card(child);
  await editAction(root, {
    id: child,
    revision: before.revision,
    description: "Outside update preserved",
  });
  await expect(
    deleteTask(root, { id: child, revision: before.revision }),
  ).rejects.toThrow(/changed/);
  await deleteTask(root, { id: child, revision: (await card(child)).revision });
  await expect(
    deleteTask(root, { id: child, revision: (await card(child)).revision }),
  ).rejects.toThrow(/already deleted/);
  await deleteTask(root, {
    id: parent,
    revision: (await card(parent)).revision,
  });
  expect((await card(child)).deleted).toBe(true);
  expect((await card(parent)).deleted).toBe(true);
  expect(
    await readFile(join(root, `.voidra/actions/${child}/action.md`), "utf8"),
  ).toContain("Outside update preserved");
  expect((await checkProject(root)).diagnostics).toEqual([]);
  expect(readActionSequence(await checkProject(root)).pending).not.toContain(
    child,
  );
});

it("preserves legacy placement on edits and excludes human work from workflow inheritance", async () => {
  const { newTaskFields } = await import("../src/index.ts");
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  await createAction(root, {
    type: "docs",
    title: "Adopt workflow",
    description: "Capture",
    by: "You",
    taskColumn: "backlog",
    taskWorkflow: 1,
  });
  const p = await checkProject(root);
  expect(await newTaskFields(root, p, "action")).toMatchObject({
    taskWorkflow: 1,
    taskColumn: "planning",
  });
  expect(await newTaskFields(root, p, "action", {}, false)).toEqual({
    targetRelease: "2.3.4",
    taskColumn: "todo",
  });
  const human = await createAction(root, {
    type: "docs",
    title: "Human prerequisite",
    description: "Manual",
    by: "You",
    doneBy: "you",
    steps: ["Confirm access"],
  });
  expect(
    (await checkProject(root)).records.get(`.voidra/actions/${human}/action.md`)
      ?.document.data.taskWorkflow,
  ).toBeUndefined();
  const meta = join(root, ".voidra/voidra.json");
  const data = JSON.parse(await readFile(meta, "utf8"));
  data.requiredVoidra = "1.1.0";
  await writeFile(meta, JSON.stringify(data));
  expect(
    (await checkProject(root)).diagnostics.some(
      (d) => d.code === "minimum-reader",
    ),
  ).toBe(true);
});
