import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  parseDeprecations,
  runDeprecationsCli,
  scanDeprecations,
} from "../src/deprecations.ts";

const today = new Date("2026-10-12T23:00:00Z");
const folders: string[] = [];
const cli = resolve(import.meta.dirname, "../src/deprecations-cli.ts");

afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

describe("comment markers", () => {
  test("accepts a dated marker and preserves its location and explanation", () => {
    const result = parseDeprecations(
      "\n/** @deprecated Use replacement. remove-after: 2027-01-01 */\nexport const old = 1;",
      "old.ts",
      today,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.markers).toEqual([
      {
        file: "old.ts",
        line: 2,
        removeAfter: "2027-01-01",
        description: "Use replacement. remove-after: 2027-01-01",
      },
    ]);
  });

  test("fails an undated marker", () => {
    expect(
      parseDeprecations("/** @deprecated Use replacement. */", "old.ts", today)
        .errors[0]?.code,
    ).toBe("undated");
  });

  test.each(["2026-02-30", "2026-13-01", "2026-1-01", "tomorrow"])(
    "rejects invalid date %s",
    (date) => {
      expect(
        parseDeprecations(
          `// @deprecated remove-after: ${date}`,
          "old.ts",
          today,
        ).errors[0]?.code,
      ).toBe("invalid-date");
    },
  );

  test("fails a marker after its final supported date", () => {
    expect(
      parseDeprecations(
        "// @deprecated remove-after: 2026-10-11",
        "old.ts",
        today,
      ).errors[0]?.code,
    ).toBe("expired");
  });

  test.each(["2026-10-12", "2026-10-13", "2026-11-11"])(
    "warns for deadline %s within 30 UTC calendar days",
    (date) => {
      const result = parseDeprecations(
        `// @deprecated remove-after: ${date}`,
        "old.ts",
        today,
      );
      expect(result.errors).toEqual([]);
      expect(result.warnings[0]?.code).toBe("expiring");
    },
  );

  test("does not warn when the deadline is 31 days away", () => {
    expect(
      parseDeprecations(
        "// @deprecated remove-after: 2026-11-12",
        "old.ts",
        today,
      ).warnings,
    ).toEqual([]);
  });

  test("handles multiline JSDoc, CRLF, trailing comments and attached closing delimiters", () => {
    const source =
      "/**\r\n * @deprecated replacement remove-after: 2027-01-01*/\r\n */\r\nexport const old = 1; // @deprecated remove-after: 2027-02-01\r\n";
    const result = parseDeprecations(source, "old.ts", today);
    expect(result.errors).toEqual([]);
    expect(
      result.markers.map(({ line, removeAfter }) => [line, removeAfter]),
    ).toEqual([
      [2, "2027-01-01"],
      [4, "2027-02-01"],
    ]);
  });

  test("ignores marker-like text in strings and template literals", () => {
    const source =
      'const a = "// @deprecated";\nconst b = `\n// @deprecated\n`;\n';
    expect(parseDeprecations(source, "strings.ts", today).markers).toEqual([]);
  });

  test("does not duplicate a comment attached to several syntax nodes", () => {
    const source =
      "/** @deprecated remove-after: 2027-01-01 */\nexport function old() { return 1; }";
    expect(parseDeprecations(source, "old.ts", today).markers).toHaveLength(1);
  });

  test("accepts an empty source file", () => {
    expect(parseDeprecations("", "empty.ts", today)).toEqual({
      markers: [],
      errors: [],
      warnings: [],
    });
  });
});

describe("repository scanning and CLI", () => {
  test("fails an empty scan but not a scanned source file with no markers", async () => {
    const folder = await fixture({});
    expect((await scanDeprecations(folder, today)).errors[0]?.code).toBe(
      "empty-scan",
    );
    await writeFile(join(folder, "empty.ts"), "");
    expect(await scanDeprecations(folder, today)).toEqual({
      files: 1,
      markers: [],
      errors: [],
      warnings: [],
    });
  });

  test("scans production source and excludes tests, fixtures, dependencies and generated files", async () => {
    const folder = await fixture({
      "src/a.ts": "// @deprecated remove-after: 2027-01-01",
      "src/b.js": "export const current = 1;",
      "src/out/production.ts": "export const generatedResult = 1;",
      "src/release/production.ts": "export const release = 1;",
      "skills/voidra-go/scripts/runtime.mjs": "// @deprecated",
      "skills/voidra-init/scripts/init.mjs": "// @deprecated",
      "skills/voidra-release/scripts/release.mjs": "// @deprecated",
      "skills/voidra-sync/scripts/sync.mjs": "// @deprecated",
      "skills/voidra-architect-general/scripts/architecture.mjs":
        "// @deprecated",
      "skills/voidra-go/scripts/authored.mjs": "export const authored = 1;",
      "src/old.test.ts": "// @deprecated",
      "src/types.d.ts": "// @deprecated",
      "src/types.d.mts": "// @deprecated",
      "src/types.d.cts": "// @deprecated",
      "tests/example.ts": "// @deprecated",
      "fixtures/example.ts": "// @deprecated",
      "node_modules/example.ts": "// @deprecated",
      ".cache/example.ts": "// @deprecated",
      "coverage/example.ts": "// @deprecated",
      "dist/example.ts": "// @deprecated",
      "apps/desktop/.next/types/app.ts": "// @deprecated",
      "apps/desktop/out/app.js": "// @deprecated",
      "apps/desktop/release/main.js": "// @deprecated",
      "README.md": "@deprecated",
    });
    await symlink(join(folder, "src"), join(folder, "linked-src"), "dir");
    const result = await scanDeprecations(folder, today);
    expect(result.files).toBe(5);
    expect(result.errors).toEqual([]);
    expect(result.markers.map(({ file }) => file)).toEqual(["src/a.ts"]);
  });

  test("returns readable success and failure output", async () => {
    const folder = await fixture({
      "old.ts": "// @deprecated remove-after: 2026-10-11",
    });
    const failed = await runDeprecationsCli([
      "--root",
      folder,
      "--today",
      "2026-10-12",
    ]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("old.ts:1");
    expect(failed.stdout).toContain("expired");
    const valid = await runDeprecationsCli([
      "--root",
      folder,
      "--today",
      "2026-09-01",
    ]);
    expect(valid.exitCode).toBe(0);
    expect(valid.stdout).toContain("2026-10-11");
  });

  test("warnings remain successful and JSON is structured", async () => {
    const folder = await fixture({
      "old.ts": "// @deprecated remove-after: 2026-10-13",
    });
    const result = await runDeprecationsCli([
      "--root",
      folder,
      "--today",
      "2026-10-12",
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      files: 1,
      warnings: [{ code: "expiring", file: "old.ts", line: 1 }],
    });
  });

  test.each([
    ["--unknown"],
    ["--root"],
    ["--today", "invalid"],
    ["unexpected"],
  ])("reports usage error for %j", async (...args) => {
    const result = await runDeprecationsCli(args);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  test("handles help and inaccessible paths", async () => {
    expect((await runDeprecationsCli(["--help"])).stdout).toContain("Usage:");
    const folder = await fixture({});
    const result = await runDeprecationsCli([
      "--root",
      join(folder, "missing"),
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ENOENT");
  });

  test("the executable reports no markers and supplies real exit codes", async () => {
    const folder = await fixture({ "empty.ts": "" });
    expect(
      execFileSync(process.execPath, [cli, "--root", folder], {
        encoding: "utf8",
      }),
    ).toContain("No deprecated fields");
    await writeFile(join(folder, "empty.ts"), "/** @deprecated old */");
    const failure = spawnSync(process.execPath, [cli, "--root", folder], {
      encoding: "utf8",
    });
    expect(failure.status).toBe(1);
    expect(failure.stdout).toContain("undated");
  });
});

async function fixture(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "voidra-deprecations-"));
  folders.push(folder);
  for (const [path, content] of Object.entries(files)) {
    const file = join(folder, path);
    await mkdir(resolve(file, ".."), { recursive: true });
    await writeFile(file, content);
  }
  return folder;
}
