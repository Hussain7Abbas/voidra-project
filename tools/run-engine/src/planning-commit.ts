import { execFile } from "node:child_process";
import {
  lstat,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  applyOperation,
  checkProject,
  hash,
  type ProjectInspection,
  safePath,
} from "voidra";
import { z } from "zod";
import { processIdentity } from "./lock.ts";

const execute = promisify(execFile);
async function git(
  root: string,
  args: string[],
  index?: string,
  input?: string,
): Promise<string> {
  if (input !== undefined) {
    return new Promise((resolveResult, reject) => {
      const child = execFile(
        "git",
        ["--literal-pathspecs", ...args],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_OPTIONAL_LOCKS: "0",
            ...(index ? { GIT_INDEX_FILE: index } : {}),
          },
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, stdout) => (error ? reject(error) : resolveResult(stdout)),
      );
      child.stdin?.end(input);
    });
  }
  return (
    await execute("git", ["--literal-pathspecs", ...args], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        ...(index ? { GIT_INDEX_FILE: index } : {}),
      },
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout;
}
const optionalRead = async (path: string): Promise<Buffer | null> => {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};
const bytesHash = (bytes: Buffer | null) =>
  bytes === null ? null : hash(bytes);
const inputSchema = z.strictObject({
  id: z.string().uuid(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  paths: z
    .array(
      z
        .string()
        .refine(
          (path) =>
            path.startsWith(".voidra/") &&
            !path.startsWith(".voidra/local/") &&
            path !== ".voidra/local" &&
            !path.includes("\\") &&
            !path.includes("\0") &&
            !path.split("/").some((part) => [".", "..", ""].includes(part)),
          "Only shared planning paths are allowed",
        ),
    )
    .min(1),
  message: z.string().trim().min(1).max(2000),
});
export type PlanningInput = z.infer<typeof inputSchema>;
export interface PlanningFile {
  path: string;
  status: "new" | "modified" | "deleted";
  hash: string | null;
  mode: number | null;
}
export interface PlanningPreview {
  enabled: boolean;
  reason: string | null;
  files: PlanningFile[];
  revision: string;
  head: string | null;
  indexHash: string | null;
}
const journalSchema = z.strictObject({
  input: inputSchema,
  preview: z.strictObject({
    enabled: z.boolean(),
    reason: z.string().nullable(),
    files: z.array(
      z.strictObject({
        path: z.string(),
        status: z.enum(["new", "modified", "deleted"]),
        hash: z.string().nullable(),
        mode: z.number().nullable(),
      }),
    ),
    revision: z.string(),
    head: z.string().nullable(),
    indexHash: z.string().nullable(),
  }),
  indexBefore: z.string(),
  phase: z.enum(["prepared", "committed", "reconciled", "failed"]),
  commit: z.string().optional(),
});
type Journal = z.infer<typeof journalSchema>;
const lockPath = ".voidra/local/planning.lock";
const journalPath = (id: string) => `.voidra/local/planning-commits/${id}.json`;
async function gitPaths(root: string) {
  const top = (await git(root, ["rev-parse", "--show-toplevel"])).trim();
  if ((await realpath(top)) !== (await realpath(root)))
    throw new Error("Open the Git repository root to commit planning changes");
  const directory = (
    await git(root, ["rev-parse", "--absolute-git-dir"])
  ).trim();
  const index = resolve(
    root,
    (await git(root, ["rev-parse", "--git-path", "index"])).trim(),
  );
  return { directory, index };
}
async function head(root: string) {
  return (
    (
      await git(root, ["rev-parse", "--verify", "HEAD"]).catch(() => "")
    ).trim() || null
  );
}
async function guard(
  root: string,
  directory: string,
  inspection?: ProjectInspection,
): Promise<void> {
  const project = inspection ?? (await checkProject(root));
  if (
    project.files.has(".voidra/local/run.lock") ||
    [...project.records.values()].some(
      (r) => r.kind === "run" && r.document.data.outcome === "running",
    )
  )
    throw new Error(
      "Finish or recover the agent run before committing planning",
    );
  if (project.diagnostics.length)
    throw new Error("Repair planning-file problems before committing");
  for (const name of [
    "MERGE_HEAD",
    "rebase-merge",
    "rebase-apply",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
  ])
    if (await lstat(join(directory, name)).catch(() => null))
      throw new Error("Finish the Git merge/rebase before committing planning");
}
async function selection(root: string): Promise<PlanningFile[]> {
  const raw = await git(root, [
    "-c",
    "status.renames=false",
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ".voidra",
  ]);
  const files: PlanningFile[] = [];
  for (const row of raw.split("\0").filter(Boolean)) {
    const path = row.slice(3);
    if (
      !path.startsWith(".voidra/") ||
      path.startsWith(".voidra/local/") ||
      path === ".voidra/local"
    )
      continue;
    const target = await safePath(root, path),
      bytes = await optionalRead(target),
      info = bytes === null ? null : await lstat(target);
    files.push({
      path,
      status:
        bytes === null
          ? "deleted"
          : row.startsWith("??") || row[0] === "A"
            ? "new"
            : "modified",
      hash: bytesHash(bytes),
      mode: info ? (info.mode & 0o111 ? 0o100755 : 0o100644) : null,
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function previewPlanning(
  root: string,
  inspection?: ProjectInspection,
): Promise<PlanningPreview> {
  let files: PlanningFile[] = [],
    currentHead: string | null = null,
    indexHash: string | null = null,
    reason: string | null = null;
  try {
    const { directory, index } = await gitPaths(root);
    currentHead = await head(root);
    indexHash = bytesHash(await optionalRead(index));
    await guard(root, directory, inspection);
    files = await selection(root);
    if (!files.length) reason = "Nothing changed in shared planning files";
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
    if (reason.includes("not a git repository"))
      reason = "This folder is not a Git repository";
  }
  return {
    enabled: reason === null,
    reason,
    files,
    head: currentHead,
    indexHash,
    revision: hash(
      JSON.stringify({ files, head: currentHead, indexHash, reason }),
    ),
  };
}
async function save(root: string, journal: Journal): Promise<void> {
  const path = journalPath(journal.input.id),
    bytes = await optionalRead(await safePath(root, path));
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: bytesHash(bytes),
        content: `${JSON.stringify(journal)}\n`,
      },
    ],
  });
}
async function acquire(root: string, id: string): Promise<() => Promise<void>> {
  const path = await safePath(root, lockPath),
    old = await optionalRead(path);
  if (old) {
    const owner = z
      .object({
        id: z.string().uuid(),
        pid: z.number().int().positive(),
        host: z.string(),
        started: z.string(),
      })
      .parse(JSON.parse(old.toString()));
    if (
      owner.id !== id ||
      owner.host !== hostname() ||
      (await processIdentity(owner.pid)) === owner.started
    )
      throw new Error(
        "Another planning commit owns this checkout; wait or recover its operation",
      );
  }
  const started = await processIdentity(process.pid);
  if (!started) throw new Error("Planning owner process is missing");
  const bytes = JSON.stringify({
    id,
    pid: process.pid,
    host: hostname(),
    started,
  });
  await applyOperation(root, {
    changes: [
      { path: lockPath, expectedHash: bytesHash(old), content: bytes },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ],
  });
  return async () => {
    await applyOperation(root, {
      changes: [{ path: lockPath, expectedHash: hash(bytes), content: null }],
    });
  };
}
async function findCommit(root: string, id: string): Promise<string | null> {
  if (!(await head(root))) return null;
  const raw = await git(root, [
      "log",
      "-z",
      "--format=%H%x00%(trailers:key=Voidra-Planning,valueonly)",
      "HEAD",
      "--",
    ]),
    fields = raw.split("\0"),
    found: string[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2)
    if (fields[i + 1]?.trim() === id) found.push(fields[i] ?? "");
  if (found.length > 1)
    throw new Error(
      "Duplicate planning-operation commits; inspect Git history",
    );
  return found[0] ?? null;
}
async function selectedIndex(root: string, paths: string[]) {
  return git(root, ["ls-files", "--stage", "-z", "--", ...paths]);
}
async function reconcile(
  root: string,
  journal: Journal,
  index: string,
): Promise<boolean> {
  if (!journal.commit || (await head(root)) !== journal.commit) return false;
  const paths = journal.input.paths;
  const tree = await git(root, [
    "ls-tree",
    "-z",
    journal.commit,
    "--",
    ...paths,
  ]);
  const wanted =
    tree
      .split("\0")
      .filter(Boolean)
      .map((row) => row.replace(/^(\d+) \w+ ([a-f0-9]+)\t/, "$1 $2 0\t"))
      .sort()
      .join("\0") + (tree ? "\0" : "");
  const staged = await selectedIndex(root, paths);
  if (
    staged.split("\0").filter(Boolean).sort().join("\0") ===
    wanted.split("\0").filter(Boolean).sort().join("\0")
  )
    return true;
  if (staged !== journal.indexBefore) return false;
  const lock = `${index}.lock`,
    before = await optionalRead(index),
    temporary = await safePath(
      root,
      `.voidra/local/planning-index-${journal.input.id}`,
    );
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  let ownsLock = true;
  const identity = await lstat(lock);
  try {
    if (before) {
      await handle.writeFile(before);
      await handle.sync();
    }
    await handle.close();
    if (
      bytesHash(await optionalRead(index)) !== bytesHash(before) ||
      (await head(root)) !== journal.commit ||
      (await selectedIndex(root, paths)) !== journal.indexBefore
    )
      return false;
    // Work on a copy under our own Git lock; unrelated entries and partial staging survive.
    if (before) {
      const target = await open(temporary, "w", 0o600);
      try {
        await target.writeFile(before);
        await target.sync();
      } finally {
        await target.close();
      }
    } else await git(root, ["read-tree", "--empty"], temporary);
    const zero = "0".repeat(journal.commit.length);
    const removed = paths.map((path) => `0 ${zero}\t${path}\0`).join("");
    await git(
      root,
      ["update-index", "-z", "--index-info"],
      temporary,
      removed + wanted,
    );
    const updated = await readFile(temporary);
    const target = await open(lock, "w");
    try {
      await target.writeFile(updated);
      await target.sync();
    } finally {
      await target.close();
    }
    if (
      bytesHash(await optionalRead(index)) !== bytesHash(before) ||
      (await head(root)) !== journal.commit
    )
      return false;
    await rename(lock, index);
    ownsLock = false;
    return true;
  } finally {
    await handle.close().catch(() => {});
    if (ownsLock) {
      const current = await lstat(lock).catch(() => null);
      if (current?.dev === identity.dev && current.ino === identity.ino)
        await unlink(lock);
    }
    await unlink(temporary).catch(() => {});
  }
}
export async function commitPlanning(
  root: string,
  raw: PlanningInput,
  options: { checkpoint?: (point: string) => void | Promise<void> } = {},
): Promise<{ commit: string; reconciled: boolean }> {
  const input = inputSchema.parse(raw),
    { directory, index } = await gitPaths(root);
  await guard(root, directory);
  if (
    (await pendingPlanning(root)).some((operation) => operation.id !== input.id)
  )
    throw new Error(
      "Recover the previous planning commit before starting another",
    );
  const old = await optionalRead(await safePath(root, journalPath(input.id)));
  let journal: Journal;
  if (old) {
    journal = journalSchema.parse(JSON.parse(old.toString()));
    if (JSON.stringify(journal.input) !== JSON.stringify(input))
      throw new Error(
        "Planning-operation inputs changed; recover the original operation",
      );
  } else {
    const preview = await previewPlanning(root);
    if (!preview.enabled) throw new Error(preview.reason ?? "Nothing changed");
    if (preview.revision !== input.revision)
      throw new Error("Planning preview changed; refresh before committing");
    if (
      new Set(input.paths).size !== input.paths.length ||
      input.paths.some(
        (path) => !preview.files.some((file) => file.path === path),
      )
    )
      throw new Error("Commit only selected previewed planning paths");
    journal = {
      input,
      preview,
      indexBefore: await selectedIndex(root, input.paths),
      phase: "prepared",
    };
  }
  if (!old) await save(root, journal);
  const release = await acquire(root, input.id);
  const temporary = await safePath(
    root,
    `.voidra/local/planning-stage-${input.id}`,
  );
  try {
    const existing = await findCommit(root, input.id);
    if (existing && journal.phase === "reconciled")
      return { commit: existing, reconciled: true };
    if (existing)
      journal = { ...journal, commit: existing, phase: "committed" };
    else {
      if (journal.commit || journal.phase === "reconciled")
        throw new Error(
          "The completed planning commit is no longer reachable; inspect Git history",
        );
      const preview = await previewPlanning(root);
      if (preview.revision !== input.revision)
        throw new Error(
          "Planning files, HEAD or index changed; refresh before committing",
        );
      await save(root, journal);
      await git(
        root,
        ["read-tree", ...(preview.head ? [preview.head] : ["--empty"])],
        temporary,
      );
      // Explicit literal paths register new files in this private index before commit --only.
      await git(root, ["add", "--", ...input.paths], temporary);
      await options.checkpoint?.("after-staging");
      await options.checkpoint?.("before-commit");
      await guard(root, directory);
      if ((await previewPlanning(root)).revision !== input.revision)
        throw new Error(
          "Planning files, HEAD or index changed before commit; refresh",
        );
      await git(
        root,
        [
          "commit",
          "--only",
          "-m",
          `${input.message}\n\nVoidra-Planning: ${input.id}`,
          "--",
          ...input.paths,
        ],
        temporary,
      );
      await options.checkpoint?.("after-commit");
      const commit = await findCommit(root, input.id);
      if (!commit)
        throw new Error(
          "Planning commit trailer was not found; inspect Git history",
        );
      journal = { ...journal, commit, phase: "committed" };
    }
    await save(root, journal);
    const reconciled = await reconcile(root, journal, index);
    if (reconciled) {
      await options.checkpoint?.("after-reconcile");
      await save(root, { ...journal, phase: "reconciled" });
    }
    return { commit: journal.commit as string, reconciled };
  } catch (error) {
    if (!(await findCommit(root, input.id)))
      await save(root, { ...journal, phase: "failed" });
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
    await release();
  }
}

export async function recoverPlanning(root: string, id: string) {
  z.string().uuid().parse(id);
  const bytes = await readFile(await safePath(root, journalPath(id))),
    journal = journalSchema.parse(JSON.parse(bytes.toString()));
  return commitPlanning(root, journal.input);
}

export async function pendingPlanning(
  root: string,
): Promise<
  { id: string; commit: string | null; recoverable: boolean; message: string }[]
> {
  const pending: {
    id: string;
    commit: string | null;
    recoverable: boolean;
    message: string;
  }[] = [];
  let owner: { id: string; pid: number; host: string; started: string } | null =
    null;
  const raw = await optionalRead(await safePath(root, lockPath));
  if (raw)
    owner = z
      .object({
        id: z.string(),
        pid: z.number(),
        host: z.string(),
        started: z.string(),
      })
      .parse(JSON.parse(raw.toString()));
  const directory = ".voidra/local/planning-commits";
  await safePath(root, `${directory}/.probe`);
  const files = await readdir(join(root, directory)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  for (const name of files) {
    if (!/^[a-f0-9-]+\.json$/.test(name)) continue;
    const path = `${directory}/${name}`,
      bytes = await readFile(await safePath(root, path));
    const journal = journalSchema.parse(JSON.parse(bytes.toString()));
    if (
      ["failed", "reconciled"].includes(journal.phase) &&
      owner?.id !== journal.input.id
    )
      continue;
    const commit = journal.commit ?? (await findCommit(root, journal.input.id));
    const recoverable =
      !owner ||
      (owner.id === journal.input.id &&
        owner.host === hostname() &&
        (await processIdentity(owner.pid)) !== owner.started);
    pending.push({
      id: journal.input.id,
      commit: commit ?? null,
      recoverable,
      message: commit
        ? "The planning commit exists. Recover to reconcile its index without creating another commit."
        : "A planning attempt was interrupted. Recover it or discard the attempt before continuing.",
    });
  }
  return pending;
}
export async function discardPlanning(root: string, id: string): Promise<void> {
  z.string().uuid().parse(id);
  if (await findCommit(root, id))
    throw new Error(
      "A commit already exists; recover it rather than discard it",
    );
  const bytes = await readFile(await safePath(root, journalPath(id))),
    journal = journalSchema.parse(JSON.parse(bytes.toString()));
  const release = await acquire(root, id);
  try {
    await save(root, { ...journal, phase: "failed" });
  } finally {
    await release();
  }
}
