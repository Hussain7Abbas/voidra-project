import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, getPlanRevision, schemas } from "voidra";

it("Release plan/tagged goldens validate through the genuine CLI, preserve exact approval and avoid creating a missing changelog", async () => {
  const catalog = JSON.parse(
    await readFile("fixtures/releases/catalog.json", "utf8"),
  ) as { name: string; project: string }[];
  expect(catalog).toHaveLength(2);
  for (const scenario of catalog) {
    const root = resolve(scenario.project),
      project = await checkProject(root),
      action = project.records.get(".voidra/actions/act-000001/action.md")
        ?.document.data;
    expect(project.diagnostics).toEqual([]);
    expect(action).toMatchObject({
      type: "release",
      releaseVersion: "0.2.0",
      releaseTag: "v0.2.0",
      releaseFiles: ["package.json"],
    });
    if (scenario.name === "release-plan")
      expect(action).toMatchObject({ stage: "review", status: "waiting" });
    else {
      expect(action).toMatchObject({ stage: "released", status: "complete" });
      expect(schemas.action.parse(action).reviewDecision?.revision).toBe(
        (await getPlanRevision(root, "act-000001")).revision,
      );
      expect(
        project.records.get(".voidra/actions/act-000000/action.md")?.document
          .data.stage,
      ).toBe("released");
    }
    await expect(readFile(resolve(root, "CHANGELOG.md"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    expect(
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            resolve("packages/voidra/dist/cli-entry.js"),
            "check",
            root,
            "--json",
          ],
          { encoding: "utf8" },
        ),
      ).diagnostics,
    ).toEqual([]);
  }
});
