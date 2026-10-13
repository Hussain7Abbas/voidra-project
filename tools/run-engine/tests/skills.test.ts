import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { lintSkills } from "../src/skills.ts";

it("checks skill metadata, entry length, unfinished scaffolds and actual relative resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-skill-lint-"));
  try {
    await mkdir(join(root, "skills/example/references"), { recursive: true });
    await writeFile(
      join(root, "skills/example/references/guide.md"),
      "# Guide\n",
    );
    const path = join(root, "skills/example/SKILL.md");
    await writeFile(
      path,
      "---\nname: example\ndescription: Test a concrete workflow.\n---\nRead [guide](references/guide.md).\n",
    );
    expect(await lintSkills(root)).toEqual([]);
    await writeFile(
      path,
      "---\nname: wrong\ndescription: ''\n---\n[missing](references/missing.md)\nTODO: fill in skill\n",
    );
    expect((await lintSkills(root)).length).toBeGreaterThan(2);
    await writeFile(
      path,
      "---\nname: example\ndescription: Test.\n---\n" +
        "Long line.\n".repeat(301),
    );
    expect((await lintSkills(root)).join("\n")).toContain("300 lines");
    await writeFile(path, "---\nname: [broken\n---\n");
    expect((await lintSkills(root)).length).toBeGreaterThan(0);
    await rm(path);
    expect((await lintSkills(root)).join("\n")).toContain("SKILL.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  expect(await lintSkills(resolve("."))).toEqual([]);
  expect(
    await readFile(resolve("skills/voidra-go/scripts/runtime.mjs"), "utf8"),
  ).toContain("Generated from tools/run-engine");
});
