import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  approvalCurrent,
  checkProject,
  listProjectAdrs,
  readPlan,
} from "voidra";

it("knowledge goldens retain exact approvals, ADR criteria/naming and settled definitions, and pass the genuine CLI", async () => {
  const catalog = JSON.parse(
    await readFile("fixtures/knowledge/catalog.json", "utf8"),
  ) as { name: string; project: string; adr: string | null }[];
  expect(catalog).toHaveLength(4);
  for (const scenario of catalog) {
    const root = resolve(scenario.project),
      project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    const action = project.records.get(".voidra/actions/act-000000/action.md")
      ?.document.data;
    expect(
      approvalCurrent(
        action?.planApproval as Parameters<typeof approvalCurrent>[0],
        readPlan(project.files, "act-000000", project.records),
      ),
    ).toBe(true);
    const adrs = await listProjectAdrs(root);
    expect(adrs.problems).toEqual([]);
    if (scenario.adr) {
      const accepted = adrs.entries.find(
        (document) => document.path === scenario.adr,
      );
      expect(accepted).toMatchObject({
        at: "2026-10-14",
        action: "act-000000",
      });
      expect(accepted?.body).toContain("hard to reverse");
      expect(accepted?.body).toContain("surprising");
      expect(accepted?.body).toContain("## Alternatives");
      expect(scenario.adr).toMatch(
        scenario.name === "existing-naming" ? /0002-/ : /2026-10-14-/,
      );
    } else expect(adrs.entries).toEqual([]);
    const glossary = await readFile(resolve(root, "GLOSSARY.md"), "utf8");
    expect(glossary).toContain("**Owner**: the person who may read a project.");
    if (scenario.name === "settled-glossary")
      expect(glossary).toContain(
        "**Note**: a saved text entry owned by one person.",
      );
    const result = execFileSync(
      process.execPath,
      [resolve("packages/voidra/dist/cli-entry.js"), "check", root, "--json"],
      { encoding: "utf8" },
    );
    expect(JSON.parse(result).diagnostics).toEqual([]);
  }
});
