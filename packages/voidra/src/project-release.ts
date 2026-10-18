import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { hash } from "./lifecycle.ts";
import { blockingPlanningDiagnostics, checkProject } from "./project.ts";
import { serializeRecord } from "./records.ts";
import {
  hashSchema,
  releaseDirectorySchema,
  releasePackageSchema,
  version,
} from "./schemas.ts";
import { applyOperation } from "./writer.ts";

export interface ProjectRelease {
  path: string;
  version: string | null;
  revision: string | null;
  message: string | null;
}
const limit = 256 * 1024;
async function packagePath(root: string, path: string): Promise<string> {
  releasePackageSchema.parse(path);
  let cursor = await realpath(root);
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    cursor = join(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw Error("Package path contains a symlink");
    if (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())
      throw Error(
        "Package path must use directories and a regular package file",
      );
  }
  return cursor;
}

/** Returns version metadata only; source/package contents never cross the bridge. */
export async function readProjectRelease(
  root: string,
  selected?: string,
): Promise<ProjectRelease> {
  if (selected === undefined) {
    const metadata = (await checkProject(root)).metadata;
    if (metadata?.releaseDirectory !== undefined || !metadata?.releasePackage)
      return discoverProjectRelease(root, metadata?.releaseDirectory ?? ".");
  }
  const path =
    selected ??
    (await checkProject(root)).metadata?.releasePackage ??
    "package.json";
  const result: ProjectRelease = {
    path,
    version: null,
    revision: null,
    message: null,
  };
  try {
    const target = await packagePath(root, path);
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      await packagePath(root, path);
      const info = await file.stat();
      if (!info.isFile()) throw Error("Package must be a regular file");
      if (info.size > limit)
        throw Error("Package exceeds the 256 KiB reading limit");
      const buffer = Buffer.alloc(limit + 1);
      let total = 0;
      while (total <= limit) {
        const { bytesRead } = await file.read(
          buffer,
          total,
          buffer.length - total,
          total,
        );
        if (!bytesRead) break;
        total += bytesRead;
        if (total > limit)
          throw Error("Package exceeds the 256 KiB reading limit");
      }
      bytes = buffer.subarray(0, total);
      await packagePath(root, path);
    } finally {
      await file.close();
    }
    result.revision = hash(bytes);
    let data: unknown;
    try {
      data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw Error("Package must contain valid UTF-8 JSON");
    }
    const parsed = z.looseObject({ version }).safeParse(data);
    if (!parsed.success) throw Error("Package needs a valid X.Y.Z version");
    result.version = parsed.data.version;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    result.message =
      code === "ENOENT"
        ? "Package not found; choose the project's package.json"
        : error instanceof z.ZodError
          ? "Choose a contained project package.json path"
          : error instanceof Error
            ? error.message
            : "Package version is unavailable";
  }
  return result;
}

// Exclude dependency, private and generated trees from bounded discovery and watching.
const releaseIgnoredDirectories = new Set([
  "node_modules",
  "fixtures",
  "test",
  "tests",
  "e2e",
  ".git",
  ".voidra",
  ".next",
  ".cache",
  "dist",
  "out",
  "build",
  "coverage",
  "vendor",
  "target",
  ".turbo",
]);
export const releaseSearchDepth = 8;
export function isReleaseSearchDirectory(name: string): boolean {
  return (
    !name.startsWith(".") &&
    !name.toLowerCase().endsWith(".app") &&
    !releaseIgnoredDirectories.has(name.toLowerCase())
  );
}

/** Search any contained folder (including app/apps/packages) for the largest version. */
export async function discoverProjectRelease(
  root: string,
  directory = ".",
): Promise<ProjectRelease> {
  releaseDirectorySchema.parse(directory);
  const base = directory === "." ? "" : directory;
  let best: ProjectRelease | null = null;
  let entries = 0;
  const scan = async (path: string, depth: number): Promise<void> => {
    let folder = await realpath(root);
    if (path)
      for (const part of path.split("/")) {
        folder = join(folder, part);
        const info = await lstat(folder);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw Error("Release folder must contain only real directories");
      }
    const handle = await opendir(folder);
    const children: string[] = [];
    let hasPackage = false;
    for await (const entry of handle) {
      if (++entries > 10000)
        throw Error(
          "Release search exceeds 10000 entries; choose a smaller folder",
        );
      if (entry.name === "package.json" && entry.isFile()) hasPackage = true;
      if (entry.isDirectory() && isReleaseSearchDirectory(entry.name))
        children.push(entry.name);
    }
    if (hasPackage) {
      const candidate = await readProjectRelease(
        root,
        path ? `${path}/package.json` : "package.json",
      );
      if (
        candidate.version &&
        (!best?.version || compareVersions(candidate.version, best.version) > 0)
      )
        best = candidate;
    }
    if (depth >= releaseSearchDepth && children.length)
      throw Error("Release search exceeds 8 levels; choose a smaller folder");
    for (const child of children.sort())
      await scan(path ? `${path}/${child}` : child, depth + 1);
  };
  try {
    await scan(base, 0);
    return (
      best ??
      (await readProjectRelease(
        root,
        base ? `${base}/package.json` : "package.json",
      ))
    );
  } catch (error) {
    return {
      path: base ? `${base}/package.json` : "package.json",
      version: null,
      revision: null,
      message: (error as NodeJS.ErrnoException).code
        ? "Release folder is unavailable"
        : error instanceof Error
          ? error.message
          : "Release search unavailable",
    };
  }
}
function compareVersions(a: string, b: string): number {
  const [coreA = "", ...suffixA] = a.split("-"),
    [coreB = "", ...suffixB] = b.split("-");
  const left = coreA.split(".").map(BigInt),
    right = coreB.split(".").map(BigInt);
  for (let i = 0; i < 3; i++)
    if (left[i] !== right[i])
      return (left[i] ?? 0n) > (right[i] ?? 0n) ? 1 : -1;
  if (!suffixA.length || !suffixB.length)
    return suffixA.length ? -1 : suffixB.length ? 1 : 0;
  const preA = suffixA.join("-").split("."),
    preB = suffixB.join("-").split(".");
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    const a = preA[i],
      b = preB[i];
    if (a === b) continue;
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    const numericA = /^\d+$/.test(a),
      numericB = /^\d+$/.test(b);
    if (numericA && numericB) {
      if (BigInt(a) !== BigInt(b)) return BigInt(a) > BigInt(b) ? 1 : -1;
      continue;
    }
    if (numericA !== numericB) return numericA ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

const selectionSchema = z.strictObject({
  path: z.string().min(1).max(4096),
  directory: z.boolean().optional(),
  revision: hashSchema,
});
export async function setReleasePackage(
  root: string,
  raw: z.input<typeof selectionSchema>,
): Promise<void> {
  const input = selectionSchema.parse(raw);
  (input.directory ? releaseDirectorySchema : releasePackageSchema).parse(
    input.path,
  );
  const project = await checkProject(root);
  const record = project.records.get(".voidra/voidra.json")?.document;
  if (!record || blockingPlanningDiagnostics(project).length)
    throw Error("Fix planning-file problems before selecting a package");
  if (hash(record.raw) !== input.revision)
    throw Error("Project changed on disk; refresh the package selection");
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (r) =>
        (r.kind === "run" && r.document.data.outcome === "running") ||
        (r.kind === "operation" && r.document.data.state === "prepared"),
    )
  )
    throw Error("Finish or recover pending work before selecting a package");
  const selected = input.directory
    ? await discoverProjectRelease(root, input.path)
    : await readProjectRelease(root, input.path);
  if (!selected.version)
    throw Error(selected.message ?? "Package version is unavailable");
  const metadata: Record<string, unknown> = {
    ...record.data,
    releasePackage: selected.path,
  };
  delete metadata.releaseDirectory;
  if (input.directory) metadata.releaseDirectory = input.path;
  await applyOperation(root, {
    changes: [
      {
        path: ".voidra/voidra.json",
        expectedHash: input.revision,
        content: serializeRecord(record, metadata).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      {
        path: ".voidra/local/planning.lock",
        expectedHash: null,
        content: null,
      },
    ],
  });
}
