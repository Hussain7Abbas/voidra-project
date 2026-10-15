import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { hash } from "./lifecycle.ts";
import { blockingPlanningDiagnostics, checkProject } from "./project.ts";
import { serializeRecord } from "./records.ts";
import { hashSchema, releasePackageSchema, version } from "./schemas.ts";
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

const selectionSchema = z.strictObject({
  path: releasePackageSchema,
  revision: hashSchema,
});
export async function setReleasePackage(
  root: string,
  raw: z.input<typeof selectionSchema>,
): Promise<void> {
  const input = selectionSchema.parse(raw);
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
  const selected = await readProjectRelease(root, input.path);
  if (!selected.version)
    throw Error(selected.message ?? "Package version is unavailable");
  await applyOperation(root, {
    changes: [
      {
        path: ".voidra/voidra.json",
        expectedHash: input.revision,
        content: serializeRecord(record, {
          ...record.data,
          releasePackage: input.path,
        }).toString(),
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
