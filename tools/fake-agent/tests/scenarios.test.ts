import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject, parseRecord, schemas } from "voidra";
import { fixture } from "../../run-engine/tests/helpers.ts";
import { runFakeAgent } from "../src/index.ts";

for (const scenario of [
  "success",
  "invalid-write",
  "crash-mid-run",
  "crash-after-commit",
  "stale-lock",
  "interrupted-operation",
] as const)
  it(`writes the scripted ${scenario} result on real files and Git`, async () => {
    const root = await fixture();
    try {
      const result = await runFakeAgent(root, scenario);
      expect(result.run).toMatch(/^run-/);
      const checked = await checkProject(root);
      if (scenario === "invalid-write")
        expect(
          checked.diagnostics.some((d) => d.file.endsWith("action.md")),
        ).toBe(true);
      else if (scenario === "interrupted-operation")
        expect(
          checked.diagnostics.some((d) => d.code === "incomplete-operation"),
        ).toBe(true);
      else expect(checked.diagnostics).toEqual([]);
      if (scenario === "success") {
        const action = schemas.action.parse(
          parseRecord(
            ".voidra/actions/act-000000/action.md",
            await readFile(join(root, ".voidra/actions/act-000000/action.md")),
          ).data,
        );
        expect(action.stage).toBe("review");
        expect(action.commits?.length).toBe(1);
      }
      if (scenario === "crash-mid-run")
        expect(
          checked.records.get(".voidra/actions/act-000000/action.md")?.document
            .data.stage,
        ).toBe("implement");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
