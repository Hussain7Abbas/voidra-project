import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  enableActionSequence,
  previewActionSequence,
  readActionSequence,
  rearrangeSequence,
  replaceActionSequence,
  sequenceWarnings,
  withActionSequence,
} from "../src/action-sequence.ts";
import {
  applyOperation,
  checkProject,
  createAction,
  editAction,
  enableTaskTracking,
  hash,
  moveTask,
  parseRecord,
  previewTaskTracking,
  queueDecision,
  recoverOperation,
  serializeRecord,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("separates pending tokens from retained ordered work, enrolls TODO once and preserves blockers", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const dep = await createAction(root, {
    type: "docs",
    title: "Dependency",
    description: "First",
    by: "You",
    taskColumn: "backlog",
    targetRelease: null,
  });
  const id = await createAction(root, {
    type: "docs",
    title: "Dependent",
    description: "Second",
    by: "You",
    taskColumn: "backlog",
    targetRelease: null,
  });
  const path = `.voidra/actions/${id}/action.md`;
  let project = await checkProject(root);
  const raw = project.files.get(path)?.toString();
  if (!raw) throw Error("Missing action");
  await editAction(root, { id, revision: hash(raw), blockedBy: [dep] });
  expect((await checkProject(root)).diagnostics).toEqual([]);
  const before = await previewActionSequence(root);
  await enableActionSequence(root, { revision: before.revision, by: "You" });
  project = await checkProject(root);
  await moveTask(root, {
    id,
    revision: hash(project.files.get(path) ?? ""),
    column: "todo",
  });
  project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  const first = readActionSequence(project);
  expect(first.enabled).toBe(true);
  expect(first.order.filter((value) => value === id)).toHaveLength(1);
  expect(first.pending).toContain(id);
  expect(queueDecision(project, id).allowed).toBe(false);
  expect(first.warnings).toContainEqual(
    expect.objectContaining({ task: id, dependency: dep, kind: "absent" }),
  );
  const queueBefore = await readFile(
    join(root, ".voidra/local/pending-actions.md"),
  );
  await moveTask(root, {
    id,
    revision: hash(project.files.get(path) ?? ""),
    column: "todo",
  });
  expect(
    await readFile(join(root, ".voidra/local/pending-actions.md")),
  ).toEqual(queueBefore);
  await moveTask(root, {
    id,
    revision: hash(project.files.get(path) ?? ""),
    column: "backlog",
  });
  const after = readActionSequence(await checkProject(root));
  expect(after.order).not.toContain(id);
  expect(after.pending).not.toContain(id);
});
it("warns about transitive/absent dependencies and rearranges without inventing entries", () => {
  const graph = [
    { id: "a", complete: false, dependencies: ["b"] },
    { id: "b", complete: false, dependencies: ["c"] },
    { id: "c", complete: false, dependencies: [] },
  ];
  expect(sequenceWarnings(["a", "c"], graph)).toEqual([
    { task: "a", dependency: "b", kind: "absent", path: ["a", "b"] },
    { task: "a", dependency: "c", kind: "later", path: ["a", "b", "c"] },
  ]);
  expect(rearrangeSequence(["a", "c"], graph)).toEqual(["c", "a"]);
  expect(
    rearrangeSequence(
      ["a", "c"],
      graph.map((node) =>
        node.id === "b" ? { ...node, complete: true } : node,
      ),
    ),
  ).toEqual(["a", "c"]);
  expect(() =>
    rearrangeSequence(
      ["a", "b"],
      [
        { id: "a", complete: false, dependencies: ["b"] },
        { id: "b", complete: false, dependencies: ["a"] },
      ],
    ),
  ).toThrow(/cycle/);
});

it("reordering preserves consumed tokens, refuses stale/partial views, and cancellation removes intent", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  await enableActionSequence(root, {
    revision: (await previewActionSequence(root)).revision,
    by: "You",
  });
  const first = await createAction(root, {
    type: "docs",
    title: "First",
    description: "One",
    by: "You",
  });
  const second = await createAction(root, {
    type: "docs",
    title: "Second",
    description: "Two",
    by: "You",
  });
  let project = await checkProject(root),
    view = readActionSequence(project);
  const queuePath = ".voidra/local/pending-actions.md",
    queue = project.records.get(queuePath)?.document;
  if (!queue) throw Error("Missing queue");
  await applyOperation(root, {
    changes: [
      {
        path: queuePath,
        expectedHash: hash(queue.raw),
        content: serializeRecord(
          queue,
          queue.data,
          view.pending
            .filter((id) => id !== first)
            .map((id, index) => `${index + 1}. [ ] ${id}`)
            .join("\n"),
        ).toString(),
      },
    ],
  });
  const third = await createAction(root, {
    type: "docs",
    title: "Third",
    description: "Three",
    by: "You",
  });
  project = await checkProject(root);
  view = readActionSequence(project);
  expect(view.order).toContain(first);
  expect(view.pending).not.toContain(first);
  expect(view.pending).toContain(third);
  const revisions = Object.fromEntries(
    view.order.map((id) => [
      id,
      hash(project.files.get(`.voidra/actions/${id}/action.md`) ?? ""),
    ]),
  );
  const input = {
    order: [...view.order].reverse(),
    revision: view.revision ?? "",
    queueRevision: hash(project.files.get(queuePath) ?? ""),
    revisions,
    by: "You",
  };
  await expect(
    replaceActionSequence(root, { ...input, order: [second] }),
  ).rejects.toThrow(/complete|hidden/);
  await expect(
    replaceActionSequence(root, {
      ...input,
      revisions: { ...revisions, [second]: "0".repeat(64) },
    }),
  ).rejects.toThrow(/task changed/i);
  await replaceActionSequence(root, input);
  const changed = readActionSequence(await checkProject(root));
  expect(changed.order).toEqual(input.order);
  expect(changed.pending).not.toContain(first);
  await expect(replaceActionSequence(root, input)).rejects.toThrow(/changed/);
  project = await checkProject(root);
  await editAction(root, {
    id: second,
    revision: hash(
      project.files.get(`.voidra/actions/${second}/action.md`) ?? "",
    ),
    cancel: true,
  });
  const cancelled = readActionSequence(await checkProject(root));
  expect(cancelled.order).not.toContain(second);
  expect(cancelled.pending).not.toContain(second);
});

it("enrollment cannot replace the caller's absent-file guard with a fresh queue revision", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  await enableActionSequence(root, {
    revision: (await previewActionSequence(root)).revision,
    by: "You",
  });
  const id = await createAction(root, {
    type: "docs",
    title: "Race",
    description: "Preserve guards",
    by: "You",
    taskColumn: "backlog",
    targetRelease: null,
  });
  const project = await checkProject(root),
    path = `.voidra/actions/${id}/action.md`,
    bytes = project.files.get(path),
    queue = project.files.get(".voidra/local/pending-actions.md");
  if (!bytes || !queue) throw Error("Missing sources");
  const doc = parseRecord(path, bytes);
  const manifest = withActionSequence(project, {
    changes: [
      {
        path,
        expectedHash: hash(bytes),
        content: serializeRecord(doc, {
          ...doc.data,
          taskColumn: "todo",
          targetRelease: "1.2.0",
        }).toString(),
      },
      {
        path: ".voidra/local/pending-actions.md",
        expectedHash: null,
        content: queue.toString(),
      },
    ],
  });
  await expect(applyOperation(root, manifest)).rejects.toThrow(
    /hash|exist|changed/i,
  );
  expect(await readFile(join(root, path))).toEqual(bytes);
  expect(
    await readFile(join(root, ".voidra/local/pending-actions.md")),
  ).toEqual(queue);
});

it("refuses damaged versioned intent without interpreting it as a legacy queue", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const path = join(root, ".voidra/local/action-sequence.json");
  await writeFile(path, '{"version":2,"order":[]}');
  const project = await checkProject(root),
    before = await readFile(path);
  expect(project.diagnostics.length).toBeGreaterThan(0);
  expect(readActionSequence(project)).toMatchObject({
    enabled: false,
    problems: expect.arrayContaining([expect.any(String)]),
  });
  await expect(previewActionSequence(root)).rejects.toThrow();
  expect(await readFile(path)).toEqual(before);
});

it("recovers an interrupted two-file reorder with one preserved token set", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  await createAction(root, {
    type: "docs",
    title: "First task",
    description: "First",
    by: "You",
  });
  await createAction(root, {
    type: "docs",
    title: "Another task",
    description: "Second",
    by: "You",
  });
  const project = await checkProject(root),
    view = readActionSequence(project),
    order = [...view.order].reverse();
  await expect(
    replaceActionSequence(
      root,
      {
        order,
        revision: view.revision ?? "",
        queueRevision: hash(
          project.files.get(".voidra/local/pending-actions.md") ?? "",
        ),
        revisions: Object.fromEntries(
          view.order.map((id) => [
            id,
            hash(project.files.get(`.voidra/actions/${id}/action.md`) ?? ""),
          ]),
        ),
        by: "You",
      },
      {
        checkpoint: (point, path) => {
          if (
            point === "change-applied" &&
            path === ".voidra/local/action-sequence.json"
          )
            throw Error("Interrupted sequence group");
        },
      },
    ),
  ).rejects.toThrow("Interrupted sequence group");
  const stopped = await checkProject(root),
    operation = [...stopped.records.values()].find(
      (record) =>
        record.kind === "operation" &&
        record.document.data.state === "prepared",
    );
  if (!operation) throw Error("Missing recoverable group");
  await recoverOperation(root, String(operation.document.data.id));
  const recovered = await checkProject(root);
  expect(recovered.diagnostics).toEqual([]);
  expect(readActionSequence(recovered).order).toEqual(order);
  expect(readActionSequence(recovered).pending).toEqual(
    order.filter((id) => view.pending.includes(id)),
  );
});
