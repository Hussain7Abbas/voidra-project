import { expect, it } from "vitest";
import { busyFiles, minimalFiles } from "../scripts/fixtures.ts";
import { inspectFiles, projectTasks } from "../src/index.ts";
import { markdown, samples } from "./samples.ts";

it("projects a promoted idea/action once, retaining provenance, children, rejected ideas and legacy release state", () => {
  const files = busyFiles();
  const tasks = projectTasks(inspectFiles(files));
  expect(tasks.some((t) => t.id === "idea-000000")).toBe(false);
  expect(tasks.find((t) => t.sourceIdea === "idea-000000")).toMatchObject({
    kind: "action",
    sourceIdea: "idea-000000",
    targetRelease: null,
    releaseAssigned: false,
  });
  expect(tasks.some((t) => t.parent !== null)).toBe(true);
  const duplicateSources = new Map(files);
  duplicateSources.set(
    ".voidra/backlog/idea-111111.md",
    Buffer.from(
      markdown({
        ...samples.idea,
        id: "idea-111111",
        status: "promoted",
        promotedTo: tasks.find((t) => t.sourceIdea === "idea-000000")?.id,
      }),
    ),
  );
  expect(
    projectTasks(inspectFiles(duplicateSources)).filter(
      (t) => t.id === "idea-000000" || t.id === "idea-111111",
    ),
  ).toEqual([]);
  const withRejected = new Map(files);
  withRejected.set(
    ".voidra/backlog/idea-111111.md",
    Buffer.from(
      markdown({
        ...samples.idea,
        id: "idea-111111",
        status: "rejected",
        reason: "Already exists",
      }),
    ),
  );
  expect(
    projectTasks(inspectFiles(withRejected)).find(
      (t) => t.id === "idea-111111",
    ),
  ).toMatchObject({ column: "backlog", archived: true, status: "rejected" });
  expect(files).toEqual(busyFiles());
});

it("maps every lifecycle and human work without pretending an initial Docs stage is already in progress", () => {
  const files = minimalFiles();
  const cases = [
    ["discovery", "ready", "todo"],
    ["plan", "waiting", "todo"],
    ["implement", "ready", "todo"],
    ["implement", "running", "in-progress"],
    ["verify", "failed", "in-progress"],
    ["review", "waiting", "review"],
    ["done", "complete", "done"],
    ["released", "complete", "done"],
    ["cancelled", "complete", "backlog"],
  ] as const;
  for (const [stage, status, column] of cases) {
    files.set(
      ".voidra/actions/act-000000/action.md",
      Buffer.from(
        markdown({
          ...samples.action,
          type: "docs",
          stage,
          status,
        }),
      ),
    );
    expect(projectTasks(inspectFiles(files))[0]).toMatchObject({
      column,
      stage,
      status,
      archived: stage === "cancelled",
    });
  }
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(
      markdown({
        ...samples.action,
        doneBy: "you",
        stage: undefined,
        status: "complete",
        steps: [{ id: "step-1", title: "Account", done: true }],
      }),
    ),
  );
  expect(projectTasks(inspectFiles(files))[0]).toMatchObject({
    column: "done",
    stage: null,
  });
});

it("keeps invalid promoted links visible and excludes records with duplicate or wrong file identities", () => {
  const files = minimalFiles();
  files.set(
    ".voidra/backlog/idea-111111.md",
    Buffer.from(
      markdown({
        ...samples.idea,
        id: "idea-111111",
        status: "promoted",
        promotedTo: "act-111111",
      }),
    ),
  );
  expect(
    projectTasks(inspectFiles(files)).some((t) => t.id === "idea-111111"),
  ).toBe(true);
  files.set(
    ".voidra/backlog/idea-222222.md",
    Buffer.from(markdown({ ...samples.idea, id: "idea-111111" })),
  );
  expect(
    projectTasks(inspectFiles(files))
      .filter((t) => t.kind === "idea")
      .map((t) => t.path),
  ).toEqual([".voidra/backlog/idea-111111.md"]);
});
