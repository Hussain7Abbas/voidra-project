import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, parseRecord, schemas } from "voidra";
import { fixture } from "../../run-engine/tests/helpers.ts";
import { runFakeAgent } from "../src/index.ts";

for (const type of [
  "feature",
  "bug",
  "improvement",
  "profile-change",
  "research",
] as const)
  it(`scripted ${type} stops at its declared planning/result gate`, async () => {
    const root = await fixture(type);
    try {
      await runFakeAgent(root, "success");
      const checked = await checkProject(root);
      expect(checked.diagnostics).toEqual([]);
      expect(
        checked.records.get(".voidra/actions/act-000000/action.md")?.document
          .data,
      ).toMatchObject({
        stage: type === "research" ? "review" : "plan",
        status: "waiting",
      });
      expect(checked.files.has(".voidra/local/run.lock")).toBe(false);
      expect(await readFile(join(root, "README.md"), "utf8")).toBe(
        "# Fixture\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

it("scripted intake creates inferred data and preserves the existing code", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-fake-intake-"));
  try {
    await expect(runFakeAgent(root, "init")).rejects.toThrow(
      "Existing-code fixture",
    );
    await cp(resolve("fixtures/existing-code/project"), root, {
      recursive: true,
    });
    await runFakeAgent(root, "init");
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(await readFile(join(root, "src/app.ts"), "utf8")).toBe(
      'export const greeting = "Hello";\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
