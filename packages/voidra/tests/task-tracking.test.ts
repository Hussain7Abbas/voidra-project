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
  parseRecord,
  previewTaskTracking,
  projectTasks,
  queueDecision,
  recoverOperation,
  replaceActionQueue,
  runCli,
  serializeRecord,
  setHumanStep,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("previews and explicitly enables tracking while preserving unknown fields, IDs and completed history", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  const action = await createAction(root, {
    type: "docs",
    title: "Work",
    description: "Keep this Markdown",
    by: "You",
  });
  const idea = await createIdea(root, {
    title: "Idea",
    description: "Notes",
    by: "You",
  });
  const done = await createAction(root, {
    type: "docs",
    title: "Old human work",
    description: "History",
    by: "You",
    doneBy: "you",
    steps: ["Complete"],
  });
  const donePath = `.voidra/actions/${done}/action.md`;
  await setHumanStep(root, {
    id: done,
    revision: hash(await readFile(join(root, donePath))),
    step: "step-1",
    done: true,
  });
  const history = await readFile(join(root, donePath));
  const path = `.voidra/actions/${action}/action.md`;
  const doc = parseRecord(path, await readFile(join(root, path)));
  await writeFile(
    join(root, path),
    serializeRecord(doc, { ...doc.data, custom: "kept" }),
  );
  const before = await readFile(join(root, path));
  const preview = await previewTaskTracking(root);
  expect(preview).toMatchObject({ version: "2.3.4", enabled: false });
  expect(preview.paths).toEqual(
    expect.arrayContaining([
      path,
      `.voidra/backlog/${idea}.md`,
      ".voidra/voidra.json",
    ]),
  );
  expect(await readFile(join(root, path))).toEqual(before);
  await enableTaskTracking(root, { revision: preview.revision });
  const project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  expect(project.metadata).toMatchObject({
    taskTracking: 1,
    requiredVoidra: "1.1.0",
  });
  expect(project.records.get(path)?.document.data).toMatchObject({
    id: action,
    targetRelease: "2.3.4",
    custom: "kept",
  });
  expect(await readFile(join(root, donePath))).toEqual(history);
  expect((await previewTaskTracking(root)).paths).toEqual([]);
});

it("activates an unversioned Profile draft explicitly and completes human slices with current release metadata", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const draft = await createAction(root, {
    type: "profile-change",
    title: "Profile draft",
    description: "Review first",
    by: "You",
    taskColumn: "backlog",
    targetRelease: null,
  });
  const path = `.voidra/actions/${draft}/action.md`;
  const doc = parseRecord(path, await readFile(join(root, path)));
  await writeFile(
    join(root, path),
    serializeRecord(doc, { ...doc.data, status: "draft" }),
  );
  expect(queueDecision(await checkProject(root), draft).allowed).toBe(false);
  await replaceActionQueue(root, {
    ids: [draft],
    revision: null,
    by: "You",
    activate: { id: draft, revision: hash(await readFile(join(root, path))) },
  });
  expect(
    projectTasks(await checkProject(root)).find((t) => t.id === draft),
  ).toMatchObject({ column: "todo", targetRelease: "2.3.4", status: "ready" });
  const parent = await createAction(root, {
    type: "feature",
    title: "Parent",
    description: "Slices",
    by: "You",
    taskColumn: "backlog",
    targetRelease: null,
  });
  const child = await createAction(root, {
    type: "docs",
    title: "Human",
    description: "Account",
    by: "You",
    doneBy: "you",
    steps: ["Create"],
    taskColumn: "backlog",
    targetRelease: null,
  });
  const childPath = `.voidra/actions/${child}/action.md`;
  await editAction(root, {
    id: child,
    revision: hash(await readFile(join(root, childPath))),
    parent,
  });
  await setHumanStep(root, {
    id: child,
    revision: hash(await readFile(join(root, childPath))),
    step: "step-1",
    done: true,
  });
  const project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  for (const id of [parent, child])
    expect(projectTasks(project).find((t) => t.id === id)).toMatchObject({
      column: "done",
      targetRelease: "2.3.4",
    });
  const parentPath = `.voidra/actions/${parent}/action.md`,
    before = await readFile(join(root, parentPath));
  await expect(
    editAction(root, {
      id: parent,
      revision: hash(before),
      targetRelease: null,
    }),
  ).rejects.toThrow(/release/);
  expect(await readFile(join(root, parentPath))).toEqual(before);
});

it("requires an exact CLI preview and rejects clearing a required release or lowering the reader minimum", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  const cli = await runCli(["migrate", root, "--tasks", "--dry-run", "--json"]);
  expect(cli.exitCode).toBe(0);
  const preview = JSON.parse(cli.stdout);
  expect((await runCli(["migrate", root, "--tasks"])).exitCode).toBe(2);
  expect(
    (await runCli(["migrate", root, "--revision", preview.revision])).exitCode,
  ).toBe(2);
  expect(
    (await runCli(["migrate", root, "--tasks", "--revision", preview.revision]))
      .exitCode,
  ).toBe(0);
  const id = await createAction(root, {
    type: "docs",
    title: "Versioned",
    description: "Body",
    by: "You",
  });
  const path = `.voidra/actions/${id}/action.md`,
    before = await readFile(join(root, path));
  await expect(
    editAction(root, { id, revision: hash(before), targetRelease: null }),
  ).rejects.toThrow(/release/i);
  expect(await readFile(join(root, path))).toEqual(before);
  const meta = JSON.parse(
    await readFile(join(root, ".voidra/voidra.json"), "utf8"),
  );
  await writeFile(
    join(root, ".voidra/voidra.json"),
    JSON.stringify({ ...meta, requiredVoidra: "1.0.0" }),
  );
  expect((await checkProject(root)).diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "minimum-reader" }),
    ]),
  );
});

it("guards package changes under the writer lock and recovers an interrupted migration without changing history", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await createAction(root, {
    type: "docs",
    title: "Work",
    description: "Body",
    by: "You",
  });
  let preview = await previewTaskTracking(root);
  await expect(
    enableTaskTracking(
      root,
      { revision: preview.revision },
      {
        checkpoint: async (point) => {
          if (point === "lock-acquired")
            await writeFile(join(root, "package.json"), '{"version":"2.3.5"}');
        },
      },
    ),
  ).rejects.toThrow(/Package changed/);
  expect((await checkProject(root)).metadata?.taskTracking).toBeUndefined();
  preview = await previewTaskTracking(root);
  let operation = "";
  await expect(
    enableTaskTracking(
      root,
      { revision: preview.revision },
      {
        checkpoint: (point, path) => {
          if (point === "journal-prepared") operation = path;
          if (point === "before-commit") throw Error("Interrupted");
        },
      },
    ),
  ).rejects.toThrow("Interrupted");
  expect(operation).toMatch(/^op-/);
  await recoverOperation(root, operation);
  expect((await checkProject(root)).diagnostics).toEqual([]);
  expect((await checkProject(root)).metadata?.taskTracking).toBe(1);
  expect((await previewTaskTracking(root)).paths).toEqual([]);
});

it("binds the preview to package and task bytes and never upgrades a project on opening it", async () => {
  const root = await materialize(minimalFiles());
  await expect(previewTaskTracking(root)).rejects.toThrow(/version|package/i);
  expect((await checkProject(root)).metadata?.taskTracking).toBeUndefined();
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  const preview = await previewTaskTracking(root);
  await writeFile(join(root, "package.json"), '{"version":"2.3.5"}');
  await expect(
    enableTaskTracking(root, { revision: preview.revision }),
  ).rejects.toThrow(/changed|refresh/i);
  expect((await checkProject(root)).metadata?.taskTracking).toBeUndefined();
});

it("defaults new tracked work to current release, permits unversioned Backlog capture and refuses non-Backlog null release", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const action = await createAction(root, {
    type: "feature",
    title: "New feature",
    description: "Details",
    by: "You",
  });
  const idea = await createIdea(root, {
    title: "Unversioned idea",
    description: "Draft",
    by: "You",
    targetRelease: null,
  });
  expect(
    projectTasks(await checkProject(root)).find((t) => t.id === action),
  ).toMatchObject({ column: "todo", targetRelease: "2.3.4" });
  expect(
    projectTasks(await checkProject(root)).find((t) => t.id === idea),
  ).toMatchObject({
    column: "backlog",
    targetRelease: null,
    releaseAssigned: true,
  });
  await expect(
    createAction(root, {
      type: "docs",
      title: "Invalid",
      description: "Details",
      by: "You",
      taskColumn: "todo",
      targetRelease: null,
    }),
  ).rejects.toThrow(/release/i);
  await writeFile(join(root, "package.json"), '{"version":"invalid"}');
  const backlog = await createAction(root, {
    type: "docs",
    title: "Still capture",
    description: "Details",
    by: "You",
  });
  expect(
    projectTasks(await checkProject(root)).find((t) => t.id === backlog),
  ).toMatchObject({ column: "backlog", targetRelease: null });
  expect(queueDecision(await checkProject(root), backlog)).toMatchObject({
    allowed: false,
    reason: expect.stringMatching(/TODO/),
  });
});
