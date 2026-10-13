import { mkdir, mkdtemp, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { linkSkills } from "../src/link.ts";

it("links only real skills into both documented project locations, repeats safely and preserves conflicting content", async () => {
  const target = await mkdtemp(join(tmpdir(), "voidra-links-"));
  try {
    await linkSkills(resolve("."), target);
    await linkSkills(resolve("."), target);
    for (const directory of [".claude/skills", ".agents/skills"]) {
      expect(await readlink(join(target, directory, "voidra-go"))).toBe(
        resolve("skills/voidra-go"),
      );
    }
    await rm(join(target, ".agents/skills/voidra-go"));
    await mkdir(join(target, ".agents/skills/voidra-go"));
    await writeFile(
      join(target, ".agents/skills/voidra-go/keep.txt"),
      "existing",
    );
    await expect(linkSkills(resolve("."), target)).rejects.toThrow(
      /existing|conflict/,
    );
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
