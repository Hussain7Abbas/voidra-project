import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject } from "voidra";

it("the outside-work golden passes the genuine CLI with inferred evidence, protected confirmation, proposals and a sync record", async () => {
  const root = resolve("fixtures/sync/outside-work/project"),
    project = await checkProject(root);
  expect(project.diagnostics).toEqual([]);
  expect(
    project.records.get(".voidra/profile/problem.md")?.document.data.answers,
  ).toMatchObject([
    {
      status: "confirmed",
      answer: "Save and reopen private project notes offline.",
    },
    { status: "inferred", source: expect.stringContaining("commit:") },
  ]);
  expect(
    project.records.get(".voidra/syncs/sync-000000.md")?.document.data
      .proposals,
  ).toEqual(["act-000001", "idea-000000"]);
  expect(
    project.records.get(".voidra/actions/act-000001/action.md")?.document.data
      .status,
  ).toBe("draft");
  expect(
    JSON.parse(
      execFileSync(
        process.execPath,
        [resolve("packages/voidra/dist/cli-entry.js"), "check", root, "--json"],
        { encoding: "utf8" },
      ),
    ).diagnostics,
  ).toEqual([]);
});
