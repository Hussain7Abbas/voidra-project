import { execFileSync, spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, PACKAGE_VERSION } from "voidra";
import { fixture } from "./helpers.ts";

it("ships the matching offline validator with every skill without a registry, package runner or project mutation", async () => {
  const root = await fixture();
  try {
    const before = (await checkProject(root)).files;
    for (const skill of [
      "voidra-go",
      "voidra-plan",
      "voidra-init",
      "voidra-release",
      "voidra-sync",
      "voidra-architect-general",
    ]) {
      const script = resolve(`skills/${skill}/scripts/voidra.mjs`);
      const options = {
        cwd: root,
        encoding: "utf8" as const,
        env: { ...process.env, PATH: "", NPM_CONFIG_OFFLINE: "true" },
      };
      expect(
        execFileSync(process.execPath, [script, "version"], options).trim(),
      ).toBe(PACKAGE_VERSION);
      const result = JSON.parse(
        execFileSync(
          process.execPath,
          [script, "check", ".", "--json"],
          options,
        ),
      );
      expect(result.valid).toBe(true);
      expect((await checkProject(root)).files).toEqual(before);
    }
    const metadata = join(root, ".voidra/voidra.json");
    const bytes = await readFile(metadata);
    await writeFile(metadata, "invalid JSON");
    let status = 0;
    try {
      execFileSync(
        process.execPath,
        [
          resolve("skills/voidra-go/scripts/voidra.mjs"),
          "check",
          ".",
          "--json",
        ],
        { cwd: root, stdio: "pipe" },
      );
    } catch (error) {
      status = (error as { status: number }).status;
    }
    expect(status).toBe(1);
    expect(await readFile(metadata, "utf8")).toBe("invalid JSON");
    await writeFile(metadata, bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("limits the offline entry point to validation and recovery commands", () => {
  const script = resolve("skills/voidra-go/scripts/voidra.mjs");
  const result = spawnSync(process.execPath, [script, "init"], {
    encoding: "utf8",
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Bundled Voidra validator:");
  const missing = spawnSync(
    process.execPath,
    [
      script,
      "recover",
      "op-missing",
      "--project",
      resolve("fixtures/new-project/project"),
    ],
    { encoding: "utf8" },
  );
  expect(missing.status).toBe(1);
});
