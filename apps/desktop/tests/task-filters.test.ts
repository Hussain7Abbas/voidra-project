import { expect, it } from "vitest";
import {
  filterTasks,
  type TaskFilters,
  taskReleaseOptions,
} from "../src/renderer/task-filters.ts";
import type { WorkspaceSnapshot } from "../src/shared/bridge.ts";

type Task = WorkspaceSnapshot["tasks"][number];
const task = (
  id: string,
  targetRelease: string | null,
  column: Task["column"] = "backlog",
): Task => ({
  id,
  targetRelease,
  column,
  kind: "action",
  title: id,
  body: "",
  path: "",
  revision: "",
  archived: false,
  stage: "implement",
  status: "ready",
  type: "docs",
  assignee: null,
  parent: null,
  blockedBy: [],
  sourceIdea: null,
  releaseAssigned: true,
});
const filters: TaskFilters = {
  release: "all",
  archived: false,
  type: "all",
  status: "all",
  assignee: "all",
};
it("filters releases without changing hidden tasks or sequence membership", () => {
  const tasks = [
    task("older", "1.2.0"),
    task("current", "1.10.0", "todo"),
    task("unassigned", null),
    { ...task("cancelled", "1.10.0"), archived: true },
  ];
  const original = structuredClone(tasks);
  expect(
    filterTasks(tasks, { ...filters, release: "current" }, "1.10.0").map(
      (t) => t.id,
    ),
  ).toEqual(["current"]);
  expect(
    filterTasks(tasks, { ...filters, release: "unassigned" }, "1.10.0").map(
      (t) => t.id,
    ),
  ).toEqual(["unassigned"]);
  expect(
    filterTasks(tasks, { ...filters, release: "1.2.0" }, "1.10.0").map(
      (t) => t.id,
    ),
  ).toEqual(["older"]);
  expect(filterTasks(tasks, { ...filters, release: "current" }, null)).toEqual(
    [],
  );
  expect(
    filterTasks(tasks, { ...filters, archived: true }, "1.10.0"),
  ).toHaveLength(4);
  expect(tasks).toEqual(original);
});
it("deduplicates assigned and historical releases and orders numeric/prerelease versions", () => {
  const tasks = [
    task("a", "1.2.0"),
    task("b", "1.10.0"),
    task("c", "2.0.0-rc.2"),
    task("d", "2.0.0-rc.10"),
  ];
  expect(
    taskReleaseOptions({
      tasks,
      projectRelease: {
        path: "package.json",
        version: "2.0.0",
        revision: null,
        message: null,
      },
      releases: [
        {
          path: "release.md",
          body: "",
          data: { version: "1.2.0", status: "released", actions: [] },
        },
      ],
    }),
  ).toEqual(["2.0.0", "2.0.0-rc.10", "2.0.0-rc.2", "1.10.0", "1.2.0"]);
});
