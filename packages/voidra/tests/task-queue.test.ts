import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import { inspectFiles, projectTasks, queueDecision } from "../src/index.ts";
import { markdown, samples } from "./samples.ts";

it("keeps tracked drafts out of execution even if their stored placement says TODO, preserving legacy draft eligibility", () => {
  const files = minimalFiles();
  const actionPath = ".voidra/actions/act-000000/action.md";
  files.set(
    actionPath,
    Buffer.from(markdown({ ...samples.action, status: "draft" })),
  );
  expect(queueDecision(inspectFiles(files), "act-000000").allowed).toBe(true);
  const metadata = ".voidra/voidra.json";
  files.set(
    metadata,
    Buffer.from(
      JSON.stringify({
        ...JSON.parse(files.get(metadata)?.toString() ?? "{}"),
        taskTracking: 1,
        requiredVoidra: "1.1.0",
      }),
    ),
  );
  files.set(
    actionPath,
    Buffer.from(
      markdown({
        ...samples.action,
        status: "draft",
        taskColumn: "todo",
        targetRelease: null,
      }),
    ),
  );
  const project = inspectFiles(files);
  expect(project.diagnostics).toEqual([]);
  expect(projectTasks(project)[0]?.column).toBe("backlog");
  expect(queueDecision(project, "act-000000")).toMatchObject({
    allowed: false,
    reason: expect.stringMatching(/TODO|draft/),
  });
});
