import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { coveragePolicy } from "../src/coverage-policy.ts";

const repository = resolve(import.meta.dirname, "../../..");
const temporaryFolders: string[] = [];
const vitestCli = join(repository, "node_modules/vitest/vitest.mjs");

afterEach(() => {
  for (const folder of temporaryFolders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

test.each([
  ["packages/voidra/src/probe.ts", "90"],
  ["apps/desktop/src/main/probe.ts", "80"],
  ["apps/desktop/src/project-service/probe.ts", "80"],
  ["tools/probe/src/probe.ts", "90"],
])(
  "rejects uncovered code in %s at the configured %s%% line threshold",
  (sourcePath, threshold) => {
    const folder = createProbe(sourcePath);
    const result = spawnSync(
      process.execPath,
      [
        vitestCli,
        "run",
        "--root",
        folder,
        "--config",
        join(folder, "vitest.config.ts"),
        "--coverage",
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain(
      `threshold (${threshold}%)`,
    );
  },
);

test("does not impose a coverage threshold on UI components", () => {
  const folder = createProbe("apps/desktop/src/renderer/probe.ts");
  expect(() =>
    execFileSync(
      process.execPath,
      [
        vitestCli,
        "run",
        "--root",
        folder,
        "--config",
        join(folder, "vitest.config.ts"),
        "--coverage",
      ],
      { stdio: "pipe", timeout: 20_000 },
    ),
  ).not.toThrow();
});

function createProbe(sourcePath: string): string {
  const folder = mkdtempSync(join(tmpdir(), "voidra-coverage-"));
  temporaryFolders.push(folder);
  const source = join(folder, sourcePath);
  mkdirSync(dirname(source), { recursive: true });
  symlinkSync(
    join(repository, "node_modules"),
    join(folder, "node_modules"),
    "dir",
  );
  writeFileSync(join(folder, "package.json"), '{"type":"module"}');
  writeFileSync(
    source,
    "export function covered() { return 1; }\nexport function missed() {\n  const first = 2;\n  const second = 3;\n  return first + second;\n}\n",
  );
  writeFileSync(
    join(folder, "probe.test.ts"),
    `import { expect, test } from "vitest";\nimport { covered } from ${JSON.stringify(`./${sourcePath}`)};\ntest("covered path", () => expect(covered()).toBe(1));\n`,
  );
  writeFileSync(
    join(folder, "vitest.config.ts"),
    `import base from ${JSON.stringify(join(repository, "vitest.config.ts"))};\nexport default { ...base, test: { ...base.test, include: ["probe.test.ts"], coverage: { ...base.test.coverage, thresholds: ${JSON.stringify(coveragePolicy)}, reporter: ["text-summary"], reportsDirectory: ${JSON.stringify(join(folder, "coverage"))} } } };\n`,
  );
  return folder;
}
