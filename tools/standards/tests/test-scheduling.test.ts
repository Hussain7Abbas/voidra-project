import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { exclusiveTestFiles } from "../../../vitest.config.ts";

const repository = resolve(import.meta.dirname, "../../..");

test("keeps every Electron/native coverage test in the exclusive group", async () => {
  const directory = join(repository, "apps/desktop/tests");
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".test.ts")) continue;
    const source = await readFile(join(directory, name), "utf8");
    if (
      /from ["'](?:@playwright\/test|\.\/coverage-setup\.ts)["']/.test(source)
    )
      expect(exclusiveTestFiles, `${name} requires the native group`).toContain(
        `apps/desktop/tests/${name}`,
      );
  }
});

test("runs isolated files together, then sensitive files exclusively, with combined coverage", async () => {
  const folder = await mkdtemp(join(tmpdir(), "voidra-test-scheduling-"));
  try {
    await symlink(
      join(repository, "node_modules"),
      join(folder, "node_modules"),
    );
    await writeFile(join(folder, "package.json"), '{"type":"module"}');
    await writeFile(
      join(folder, "probe.ts"),
      "export function isolated() { return 1; }\nexport function native() { return 2; }\n",
    );
    for (const id of ["a", "b"]) {
      await writeFile(
        join(folder, `isolated-${id}.test.ts`),
        `import { test, expect } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { isolated } from './probe.ts';
test('isolated ${id}', async () => {
  writeFileSync('${id}.started', '');
  await expect.poll(() => existsSync('a.started') && existsSync('b.started'), {timeout: 5000}).toBe(true);
  expect(isolated()).toBe(1);
  writeFileSync('${id}.done', '');
});`,
      );
      await writeFile(
        join(folder, `native-${id}.test.ts`),
        `import { test, expect } from 'vitest';
import { existsSync, openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { native } from './probe.ts';
test('native ${id}', async () => {
  expect(existsSync('a.done') && existsSync('b.done')).toBe(true);
  const lock = openSync('exclusive.lock', 'wx');
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(native()).toBe(2);
    writeFileSync('native-${id}.done', '');
  } finally { closeSync(lock); unlinkSync('exclusive.lock'); }
});`,
      );
    }
    await writeFile(
      join(folder, "vitest.config.ts"),
      `import base from ${JSON.stringify(join(repository, "vitest.config.ts"))};
export default { ...base, test: { ...base.test,
  projects: base.test.projects.map(project => ({ ...project, test: {
    ...project.test, exclude: [], include: [project.test.name === 'isolated' ? 'isolated-*.test.ts' : 'native-*.test.ts'],
  } })),
  coverage: { provider: 'v8', include: ['probe.ts'], reporter: ['json-summary'], thresholds: { lines: 100, functions: 100 } },
} };`,
    );
    const result = spawnSync(
      process.execPath,
      [join(repository, "node_modules/vitest/vitest.mjs"), "run", "--coverage"],
      { cwd: folder, encoding: "utf8", timeout: 25_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    for (const name of ["a.done", "b.done", "native-a.done", "native-b.done"])
      expect(await readFile(join(folder, name), "utf8")).toBe("");
    const summary = JSON.parse(
      await readFile(join(folder, "coverage/coverage-summary.json"), "utf8"),
    ) as { total: { lines: { pct: number }; functions: { pct: number } } };
    expect(summary.total.lines.pct).toBe(100);
    expect(summary.total.functions.pct).toBe(100);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
