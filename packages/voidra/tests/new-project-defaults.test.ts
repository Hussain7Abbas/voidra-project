import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  checkProject,
  createAction,
  createIdea,
  hash,
  initializeProject,
  loadTemplate,
  moveTask,
  PACKAGE_VERSION,
  projectTasks,
  queueDecision,
  readActionSequence,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

for (const grouped of [false, true]) {
  it(`defaults fresh initialization and capture to release-aware tasks (${grouped ? "grouped" : "staged"})`, async () => {
    const root = await materialize(new Map());
    await writeFile(join(root, "package.json"), '{"version":"1.2.3"}\n');
    const template = await loadTemplate(
      resolve("templates/general/template.yaml"),
    );
    await initializeProject(
      root,
      template,
      {
        name: "Fresh",
        answers: { "problem.goal": { value: "Build a useful tool" } },
        bootstrap: false,
      },
      grouped ? {} : undefined,
    );
    const id = await createAction(root, {
      type: "docs",
      title: "New work",
      description: "Current version by default",
      by: "You",
    });
    const idea = await createIdea(root, {
      title: "Later",
      description: "Backlog",
      by: "You",
    });
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(project.metadata).toMatchObject({
      taskTracking: 1,
      requiredVoidra: PACKAGE_VERSION,
    });
    expect(projectTasks(project).find((task) => task.id === id)).toMatchObject({
      column: "todo",
      targetRelease: "1.2.3",
    });
    expect(
      projectTasks(project).find((task) => task.id === idea),
    ).toMatchObject({ column: "backlog", targetRelease: "1.2.3" });
    expect(readActionSequence(project)).toMatchObject({
      enabled: true,
      order: [id],
      pending: [id],
    });
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(
      '{"version":"1.2.3"}\n',
    );
  });
  it(`keeps missing-version Bootstrap and new capture in Backlog until a real package exists (${grouped ? "grouped" : "staged"})`, async () => {
    const root = await materialize(new Map()),
      template = await loadTemplate(resolve("templates/general/template.yaml"));
    const initialized = await initializeProject(
      root,
      template,
      {
        name: "Fresh",
        answers: { "problem.goal": { value: "Build a useful tool" } },
      },
      grouped ? {} : undefined,
    );
    const id = await createAction(root, {
      type: "docs",
      title: "Future work",
      description: "Wait for a version source",
      by: "You",
    });
    let project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(
      projectTasks(project).find((task) => task.id === initialized.bootstrap),
    ).toMatchObject({ column: "backlog", targetRelease: null });
    expect(projectTasks(project).find((task) => task.id === id)).toMatchObject({
      column: "backlog",
      targetRelease: null,
    });
    expect(queueDecision(project, id).allowed).toBe(false);
    expect(readActionSequence(project).order).toEqual([]);
    const path = `.voidra/actions/${id}/action.md`,
      revision = hash(project.files.get(path) as Buffer);
    await expect(
      moveTask(root, {
        id,
        revision,
        column: "todo",
        by: "You",
      }),
    ).rejects.toThrow(/release|version|package/i);
    await writeFile(join(root, "package.json"), '{"version":"0.1.0"}\n');
    await moveTask(root, {
      id,
      revision,
      column: "todo",
      by: "You",
    });
    project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(projectTasks(project).find((task) => task.id === id)).toMatchObject({
      column: "todo",
      targetRelease: "0.1.0",
    });
    expect(readActionSequence(project).order).toEqual([id]);
  });
}
it("enrolls a fresh Bootstrap once when its real package already supplies a release", async () => {
  const root = await materialize(new Map()),
    template = await loadTemplate(resolve("templates/general/template.yaml"));
  await writeFile(join(root, "package.json"), '{"version":"2.0.0"}\n');
  const { bootstrap } = await initializeProject(root, template, {
    name: "Fresh",
    answers: { "problem.goal": { value: "Useful work" } },
  });
  const project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  expect(
    projectTasks(project).find((task) => task.id === bootstrap),
  ).toMatchObject({ targetRelease: "2.0.0", column: "planning" });
  expect(readActionSequence(project)).toMatchObject({
    enabled: true,
    order: [bootstrap],
    pending: [bootstrap],
  });
});
