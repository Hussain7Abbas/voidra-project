import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, schemas } from "voidra";

const catalog = JSON.parse(
  await readFile("fixtures/architecture/catalog.json", "utf8"),
) as { name: string; project: string; gate: string }[];
for (const entry of catalog)
  it(`validates architecture golden and its gate with the API and published-contract CLI: ${entry.name}`, async () => {
    const result = await checkProject(resolve(entry.project));
    expect(result.diagnostics).toEqual([]);
    const cli = spawnSync(
      process.execPath,
      [
        resolve("packages/voidra/dist/cli-entry.js"),
        "check",
        resolve(entry.project),
        "--json",
      ],
      { encoding: "utf8" },
    );
    expect(cli.status, cli.stderr).toBe(0);
    const actions = [...result.records.values()]
      .filter((r) => r.kind === "action")
      .map((r) => schemas.action.parse(r.document.data));
    expect(
      actions.every(
        (a) =>
          ["discovery", "plan"].includes(a.stage ?? "") &&
          !a.planApproval &&
          !a.commits,
      ),
    ).toBe(true);
    if (entry.gate === "slices")
      expect(actions.filter((a) => a.parent === "act-000000")).toHaveLength(3);
    else expect(actions[0]?.status).toBe("waiting");
  });
