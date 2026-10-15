import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  checkProject,
  hash,
  readProjectRelease,
  setReleasePackage,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("reads only a bounded project package version and persists a per-project alternate without reading source into the result", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version: "0.0.0", private: true, secret: "not returned" }),
  );
  expect(await readProjectRelease(root)).toMatchObject({
    path: "package.json",
    version: "0.0.0",
    message: null,
  });
  await mkdir(join(root, "apps/web"), { recursive: true });
  await writeFile(
    join(root, "apps/web/package.json"),
    JSON.stringify({ version: "2.3.4" }),
  );
  const project = await checkProject(root);
  await setReleasePackage(root, {
    path: "apps/web/package.json",
    revision: hash(project.files.get(".voidra/voidra.json") as Buffer),
  });
  expect(await readProjectRelease(root)).toMatchObject({
    path: "apps/web/package.json",
    version: "2.3.4",
    message: null,
  });
  await writeFile(join(root, "apps/web/package.json"), '{"version":"2.4.0"}');
  const result = await readProjectRelease(root);
  expect(result.version).toBe("2.4.0");
  expect(Object.keys(result).sort()).toEqual([
    "message",
    "path",
    "revision",
    "version",
  ]);
  await expect(
    setReleasePackage(root, { path: "package.json", revision: "0".repeat(64) }),
  ).rejects.toThrow(/changed|hash/i);
});

it("reports absent, invalid, oversized, invalid-UTF8 and non-versioned packages without leaking package contents", async () => {
  const root = await materialize(minimalFiles());
  expect(await readProjectRelease(root)).toMatchObject({
    version: null,
    revision: null,
  });
  for (const raw of [
    "{ SECRET",
    '{"name":"app"}',
    '{"version":"latest"}',
    " ".repeat(256 * 1024 + 1),
    Buffer.from([0xff]),
  ]) {
    await writeFile(join(root, "package.json"), raw);
    const result = await readProjectRelease(root);
    expect(result.version).toBeNull();
    expect(result.message).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("SECRET");
  }
});

it("refuses traversal, absolute paths, private folders, wrong filenames and symlink components", async () => {
  const root = await materialize(minimalFiles());
  for (const path of [
    "../package.json",
    "/tmp/package.json",
    "apps/../package.json",
    "apps\\package.json",
    "other.json",
    ".voidra/package.json",
    "node_modules/pkg/package.json",
    ".git/package.json",
    ".Git/package.json",
    "NODE_MODULES/pkg/package.json",
    ".Voidra/package.json",
  ]) {
    await expect(
      setReleasePackage(root, { path, revision: "0".repeat(64) }),
    ).rejects.toThrow();
    expect((await readProjectRelease(root, path)).version).toBeNull();
  }
  await writeFile(join(root, "real.json"), '{"version":"9.9.9"}');
  await symlink(join(root, "real.json"), join(root, "package.json"));
  expect(await readProjectRelease(root)).toMatchObject({
    version: null,
    message: expect.stringMatching(/symlink/i),
  });
  await mkdir(join(root, "packages"));
  await symlink(root, join(root, "packages/linked"));
  expect(
    (await readProjectRelease(root, "packages/linked/package.json")).message,
  ).toMatch(/symlink/i);
});
