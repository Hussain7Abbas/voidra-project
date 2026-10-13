import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import ts from "typescript";

export interface Diagnostic {
  file: string;
  line: number;
  code: "undated" | "invalid-date" | "expired" | "expiring" | "empty-scan";
  message: string;
}

export interface Marker {
  file: string;
  line: number;
  removeAfter: string | null;
  description: string;
}

interface MarkerResult {
  markers: Marker[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface ScanResult extends MarkerResult {
  files: number;
}

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  ".cache",
  ".next",
  "e2e",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
  "tests",
  "test",
  "fixtures",
  "__tests__",
]);
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const millisecondsPerDay = 86_400_000;

export function parseDeprecations(
  source: string,
  file: string,
  today = new Date(),
): MarkerResult {
  const result: MarkerResult = { markers: [], errors: [], warnings: [] };
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const comments = new Map<number, ts.CommentRange>();
  const collect = (node: ts.Node): void => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ])
      comments.set(range.pos, range);
    ts.forEachChild(node, collect);
  };
  collect(parsed);
  const todayMidnight = Date.parse(
    `${today.toISOString().slice(0, 10)}T00:00:00Z`,
  );
  for (const range of [...comments.values()].sort((a, b) => a.pos - b.pos)) {
    const firstLine = parsed.getLineAndCharacterOfPosition(range.pos).line + 1;
    for (const [offset, text] of source
      .slice(range.pos, range.end)
      .split(/\r?\n/)
      .entries()) {
      const match = /@deprecated\b(.*)/.exec(text);
      if (!match) continue;
      const description = (match[1] ?? "").replace(/\*\/\s*$/, "").trim();
      const removeAfter =
        /remove-after:\s*([^\s*]+)/.exec(description)?.[1] ?? null;
      const line = firstLine + offset;
      result.markers.push({ file, line, removeAfter, description });
      if (removeAfter === null) {
        result.errors.push({
          file,
          line,
          code: "undated",
          message: "Missing remove-after: YYYY-MM-DD",
        });
        continue;
      }
      const deadline = parseDate(removeAfter);
      if (deadline === null) {
        result.errors.push({
          file,
          line,
          code: "invalid-date",
          message: `Invalid removal date: ${removeAfter}`,
        });
        continue;
      }
      const daysRemaining =
        (deadline.getTime() - todayMidnight) / millisecondsPerDay;
      if (daysRemaining < 0)
        result.errors.push({
          file,
          line,
          code: "expired",
          message: `Removal deadline ${removeAfter} has passed`,
        });
      else if (daysRemaining <= 30)
        result.warnings.push({
          file,
          line,
          code: "expiring",
          message: `Removal deadline ${removeAfter} is in ${daysRemaining} UTC calendar days`,
        });
    }
  }
  return result;
}

export async function scanDeprecations(
  root: string,
  today = new Date(),
): Promise<ScanResult> {
  const result: ScanResult = {
    files: 0,
    markers: [],
    errors: [],
    warnings: [],
  };
  const directory = resolve(root);
  const visit = async (folder: string): Promise<void> => {
    const entries = (await readdir(folder, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const path = join(folder, entry.name);
      const relativePath = relative(directory, path).split(sep).join("/");
      const generatedDesktopOutput =
        /^apps\/desktop\/(?:out|release)(?:\/|$)/.test(relativePath);
      if (
        entry.isDirectory() &&
        !ignoredDirectories.has(entry.name) &&
        !generatedDesktopOutput
      )
        await visit(path);
      else if (
        entry.isFile() &&
        relativePath !== "skills/voidra-go/scripts/runtime.mjs" &&
        relativePath !== "skills/voidra-plan/scripts/runtime.mjs" &&
        relativePath !== "skills/voidra-init/scripts/init.mjs" &&
        relativePath !== "skills/voidra-release/scripts/release.mjs" &&
        relativePath !==
          "skills/voidra-architect-general/scripts/architecture.mjs" &&
        sourceExtensions.has(extname(entry.name)) &&
        !/\.(?:test|spec)\.[^.]+$/.test(entry.name) &&
        !/\.d\.(?:ts|mts|cts)$/.test(entry.name)
      ) {
        const parsed = parseDeprecations(
          await readFile(path, "utf8"),
          relative(directory, path).split(sep).join("/"),
          today,
        );
        result.files += 1;
        result.markers.push(...parsed.markers);
        result.errors.push(...parsed.errors);
        result.warnings.push(...parsed.warnings);
      }
    }
  };
  await visit(directory);
  if (result.files === 0)
    result.errors.push({
      file: ".",
      line: 0,
      code: "empty-scan",
      message:
        "No production source files were scanned; check the scan root and exclusions",
    });
  return result;
}

interface CliResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

const usage =
  "Usage: deprecations [--root <folder>] [--today YYYY-MM-DD] [--json] [--help]\n";

export async function runDeprecationsCli(args: string[]): Promise<CliResult> {
  let values: { root?: string; today?: string; json?: boolean; help?: boolean };
  let today = new Date();
  try {
    ({ values } = parseArgs({
      args,
      options: {
        root: { type: "string" },
        today: { type: "string" },
        json: { type: "boolean" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }));
    if (values.help) return { exitCode: 0, stdout: usage, stderr: "" };
    if (values.today !== undefined) {
      const parsed = parseDate(values.today);
      if (parsed === null)
        throw new Error("--today must be a valid YYYY-MM-DD date");
      today = parsed;
    }
  } catch (error) {
    return { exitCode: 2, stdout: "", stderr: `${String(error)}\n${usage}` };
  }
  try {
    const result = await scanDeprecations(values.root ?? process.cwd(), today);
    const output = values.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatReport(result);
    return {
      exitCode: result.errors.length > 0 ? 1 : 0,
      stdout: output,
      stderr: "",
    };
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: `${String(error)}\n` };
  }
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function formatReport(result: ScanResult): string {
  const lines = result.markers.map(
    (marker) => `${marker.file}:${marker.line} ${marker.description}`,
  );
  for (const diagnostic of [...result.errors, ...result.warnings])
    lines.push(
      `${diagnostic.file}:${diagnostic.line} ${diagnostic.code}: ${diagnostic.message}`,
    );
  if (result.markers.length === 0 && result.errors.length === 0)
    lines.push(
      `No deprecated fields found in ${result.files} production source files.`,
    );
  lines.push(
    `Scanned ${result.files} files; ${result.markers.length} markers, ${result.errors.length} errors, ${result.warnings.length} warnings.`,
  );
  return `${lines.join("\n")}\n`;
}
