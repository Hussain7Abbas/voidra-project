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

it("discovers arbitrary monorepo subfolders, compares numeric versions and keeps a selected folder live", async () => {
  const root = await materialize(minimalFiles());
  for (const [path, version] of Object.entries({
    "package.json": "0.0.0",
    "app/web/package.json": "2.9.0",
    "app/native/package.json": "2.10.0",
    "products/service/package.json": "3.0.0",
    "node_modules/dependency/package.json": "99.0.0",
    "dist/package.json": "98.0.0",
    "fixtures/example/package.json": "97.0.0",
    "Desktop.app/Contents/package.json": "96.0.0",
  })) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), JSON.stringify({ version }));
  }
  await symlink(join(root, "node_modules"), join(root, "linked"));
  expect(await readProjectRelease(root)).toMatchObject({
    path: "products/service/package.json",
    version: "3.0.0",
  });
  const project = await checkProject(root);
  await setReleasePackage(root, {
    path: "app",
    directory: true,
    revision: hash(project.files.get(".voidra/voidra.json") as Buffer),
  });
  expect(await readProjectRelease(root)).toMatchObject({
    path: "app/native/package.json",
    version: "2.10.0",
  });
  await writeFile(join(root, "app/web/package.json"), '{"version":"4.0.0"}');
  expect(await readProjectRelease(root)).toMatchObject({
    path: "app/web/package.json",
    version: "4.0.0",
  });
  await setReleasePackage(root, {
    path: "app/native/package.json",
    revision: hash(
      (await checkProject(root)).files.get(".voidra/voidra.json") as Buffer,
    ),
  });
  expect((await checkProject(root)).metadata?.releaseDirectory).toBeUndefined();
  expect((await readProjectRelease(root)).version).toBe("2.10.0");
});

it("refuses unsafe or empty discovery folders and guards folder selection revisions", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.0.0"}');
  await symlink(root, join(root, "linked"));
  const revision = hash(
    (await checkProject(root)).files.get(".voidra/voidra.json") as Buffer,
  );
  for (const path of [
    "..",
    "/tmp",
    ".voidra",
    "node_modules",
    "linked",
    "missing",
  ]) {
    await expect(
      setReleasePackage(root, { path, directory: true, revision }),
    ).rejects.toThrow();
  }
  await expect(
    setReleasePackage(root, {
      path: ".",
      directory: true,
      revision: "0".repeat(64),
    }),
  ).rejects.toThrow(/changed/);
});

it("reports bounded search exhaustion rather than returning a partial winner", async () => {
  const root = await materialize(minimalFiles());
  await writeFile(join(root, "package.json"), '{"version":"1.0.0"}');
  const nested = Array.from({ length: 9 }, () => "child").join("/");
  await mkdir(join(root, nested), { recursive: true });
  expect(await readProjectRelease(root)).toMatchObject({
    version: null,
    message: expect.stringMatching(/8 levels/),
  });
  const wide = await materialize(minimalFiles());
  // Directory entries include files we never read; the scan must still be bounded.
  await Promise.all(
    Array.from({ length: 10001 }, (_, i) =>
      writeFile(join(wide, `${i}.txt`), ""),
    ),
  );
  expect(await readProjectRelease(wide)).toMatchObject({
    version: null,
    message: expect.stringMatching(/10000 entries/),
  });
});

it("orders equal versions deterministically and retains prerelease precedence", async () => {
  const root = await materialize(minimalFiles());
  await mkdir(join(root, "app"));
  for (const [a, b, winner] of [
    ["2.10.0", "2.10.0", "package.json"],
    ["2.10.0-beta.9", "2.10.0-beta.10", "app/package.json"],
    ["2.10.0-beta.10", "2.10.0", "app/package.json"],
    ["2.10.0", "2.10.0-beta.10", "package.json"],
    ["2.10.0-beta", "2.10.0-beta.1", "app/package.json"],
    ["2.10.0-beta.2", "2.10.0-beta.alpha", "app/package.json"],
  ]) {
    await writeFile(join(root, "package.json"), JSON.stringify({ version: a }));
    await writeFile(
      join(root, "app/package.json"),
      JSON.stringify({ version: b }),
    );
    expect((await readProjectRelease(root)).path).toBe(winner);
  }
});
