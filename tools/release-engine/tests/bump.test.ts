import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { resolveReleaseRequest } from "../src/bump.ts";
import { fixture } from "./helpers.ts";

test("Xeploy plans stable patch, minor and major releases without changing files or Git", async () => {
  const root = await fixture();
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    for (const [bump, version] of [
      ["patch", "0.2.1"],
      ["minor", "0.3.0"],
      ["major", "1.0.0"],
    ] as const)
      expect(await resolveReleaseRequest(root, { bump })).toEqual({
        version,
        tag: `v${version}`,
      });
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe("");
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe(head);
    expect(
      execFileSync("git", ["tag", "--list"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit versions support immutable retries without reading newer alignment; invalid and ambiguous requests stop", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "packages/voidra/src/versions.ts"), "broken");
    expect(await resolveReleaseRequest(root, { version: "12.30.456" })).toEqual(
      { version: "12.30.456", tag: "v12.30.456" },
    );
    for (const version of ["v1.2.3", "01.2.3", "1.2", "1.2.3-rc.1"])
      await expect(resolveReleaseRequest(root, { version })).rejects.toThrow(
        /VERSION/,
      );
    await expect(resolveReleaseRequest(root, {})).rejects.toThrow(
      /VERSION|BUMP/,
    );
    await expect(
      resolveReleaseRequest(root, { version: "1.2.3", bump: "patch" }),
    ).rejects.toThrow(/either|both/);
    await expect(resolveReleaseRequest(root, { bump: "rc" })).rejects.toThrow(
      /patch|minor|major/,
    );
    await expect(
      resolveReleaseRequest(root, { bump: "patch" }),
    ).rejects.toThrow(/declaration|align|match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bump planning rejects unsafe integer rounding and overflow", async () => {
  const root = await fixture();
  try {
    for (const version of ["9007199254740993.0.0", "9007199254740991.0.0"]) {
      for (const path of [
        "apps/desktop/package.json",
        "packages/voidra/package.json",
      ]) {
        const data = JSON.parse(await readFile(join(root, path), "utf8"));
        data.version = version;
        await writeFile(join(root, path), JSON.stringify(data));
      }
      await writeFile(
        join(root, "packages/voidra/src/versions.ts"),
        `export const PACKAGE_VERSION = "${version}";\n`,
      );
      const skill = join(root, "skills/voidra-go/SKILL.md");
      await writeFile(
        skill,
        (await readFile(skill, "utf8")).replace(
          /version: "[^"]+"/,
          `version: "${version}"`,
        ),
      );
      await expect(
        resolveReleaseRequest(root, { bump: "major" }),
      ).rejects.toThrow(/safe integer/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
