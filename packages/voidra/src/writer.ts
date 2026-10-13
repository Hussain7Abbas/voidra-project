import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { type Diagnostic, VoidraError } from "./errors.ts";
import { createId } from "./ids.ts";
import { hash, type Lifecycles } from "./lifecycle.ts";
import {
  deferredConflictDiagnostics,
  diagnosticFingerprint,
  FORMAT_VERSION,
  inspectFiles,
  type ProjectFiles,
  readProjectFiles,
} from "./project.ts";
import { parseRecord } from "./records.ts";
import { hashSchema, type Operation, schemas } from "./schemas.ts";
import { upgradePrototype } from "./versions.ts";
export const manifestSchema = z.looseObject({
  id: z
    .string()
    .regex(/^op-[0-9a-hjkmnp-tv-z]{6}$/)
    .optional(),
  changes: z
    .array(
      z.looseObject({
        path: z.string().min(1),
        expectedHash: hashSchema.nullable(),
        content: z.string().nullable(),
      }),
    )
    .min(1),
});
export type WriteManifest = z.infer<typeof manifestSchema>;
export type Checkpoint = (point: string, path: string) => Promise<void> | void;
export interface WriteOptions {
  /** Undo initialization only: permit a wholly absent shared project, never a partial one. */
  allowEmptyProject?: boolean;
  allowGlossary?: boolean;
  checkpoint?: Checkpoint;
  lifecycles?: Lifecycles;
}
export interface OperationResult {
  id: string;
  state: Operation["state"];
  alreadyCompleted: boolean;
}
export interface OperationObserver {
  prepared(operation: Operation): Promise<void> | void;
  committed(id: string): Promise<void> | void;
}
const observers = new AsyncLocalStorage<{
  root: string;
  observer: OperationObserver;
}>();
/** Scope app history to this asynchronous edit; agent/CLI writes stay independent. */
export async function withOperationObserver<T>(
  root: string,
  observer: OperationObserver,
  edit: () => Promise<T>,
): Promise<T> {
  return observers.run({ root: await realpath(root), observer }, edit);
}
function operationObserver(root: string): OperationObserver | undefined {
  const context = observers.getStore();
  return context?.root === root ? context.observer : undefined;
}
const journalDir = ".voidra/local/operations";
const lockPath = ".voidra/local/writer.lock";
const optionalRead = async (path: string): Promise<Buffer | null> => {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};
const currentHash = (bytes: Buffer | null): string | null =>
  bytes === null ? null : hash(bytes);
function fail(code: string, path: string, message: string): never {
  throw new VoidraError(code, path, message);
}
export async function safePath(
  root: string,
  path: string,
  allowGlossary = false,
  internal = false,
): Promise<string> {
  if (
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path
      .split("/")
      .some((part) => part === ".." || part === "." || part === "") ||
    (!(path.startsWith(".voidra/") && path !== ".voidra/") &&
      !(allowGlossary && path === "GLOSSARY.md"))
  )
    fail(
      "path",
      path,
      "Unsafe write path; use .voidra/ or explicitly allow root GLOSSARY.md",
    );
  if (
    !internal &&
    (path === lockPath ||
      path.startsWith(`${journalDir}/`) ||
      path === journalDir)
  )
    fail("path", path, "This path is reserved for recovery metadata");
  let cursor = root;
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink())
        fail("symlink", path, "Write path contains a symlink");
      if (cursor === join(root, path) && !stat.isFile())
        fail("path", path, "Write target must be a regular file");
      if (cursor !== join(root, path) && !stat.isDirectory())
        fail("path", path, "Write ancestor must be a directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return join(root, path);
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function atomicReplace(
  root: string,
  path: string,
  content: string | null,
  expected: string | null,
  options: WriteOptions,
  internal = false,
): Promise<void> {
  const target = await safePath(root, path, options.allowGlossary, internal);
  await mkdir(dirname(target), { recursive: true });
  await safePath(root, path, options.allowGlossary, internal);
  if (content === null) {
    await options.checkpoint?.("before-rename", path);
    await safePath(root, path, options.allowGlossary, internal);
    if (currentHash(await optionalRead(target)) !== expected)
      fail("hash-conflict", path, "Expected hash conflict before deletion");
    if (expected !== null) await unlink(target);
    await syncDirectory(dirname(target));
    await options.checkpoint?.("after-rename", path);
    return;
  }
  const temp = join(dirname(target), `.voidra-tmp-${randomUUID()}`);
  const handle = await open(temp, "wx", 0o600);
  try {
    try {
      await handle.writeFile(content, "utf8");
      await options.checkpoint?.("temp-written", path);
      await handle.sync();
      await options.checkpoint?.("temp-flushed", path);
    } finally {
      await handle.close();
    }
    await options.checkpoint?.("before-rename", path);
    await safePath(root, path, options.allowGlossary, internal);
    if (currentHash(await optionalRead(target)) !== expected)
      fail("hash-conflict", path, "Expected hash conflict before replacement");
    await rename(temp, target);
    await syncDirectory(dirname(target));
    await options.checkpoint?.("after-rename", path);
  } finally {
    await unlink(temp).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}

async function acquire(
  root: string,
  _options: WriteOptions,
  recovery = false,
): Promise<() => Promise<void>> {
  const target = await safePath(root, lockPath, false, true);
  await mkdir(dirname(target), { recursive: true });
  await safePath(root, lockPath, false, true);
  if (recovery) {
    const old = await optionalRead(target);
    if (old) {
      let owner: { pid?: number; token?: string };
      try {
        owner = JSON.parse(old.toString());
      } catch {
        fail(
          "writer-lock",
          lockPath,
          "Invalid writer lock; inspect its owner before recovery",
        );
      }
      if (!Number.isInteger(owner.pid) || (owner.pid ?? 0) < 1 || !owner.token)
        fail("writer-lock", lockPath, "Invalid writer lock owner");
      try {
        process.kill(owner.pid as number, 0);
        fail(
          "writer-lock",
          lockPath,
          "Cannot recover a live writer lock owner",
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      if (currentHash(await optionalRead(target)) !== hash(old))
        fail("writer-lock", lockPath, "Writer lock owner changed");
      await unlink(target);
    }
  }
  const token = randomUUID();
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(target, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      fail(
        "writer-lock",
        lockPath,
        "Another operation owns the writer lock; recover explicitly after its owner exits",
      );
    throw error;
  }
  await handle.writeFile(
    JSON.stringify({
      pid: process.pid,
      token,
      startedAt: new Date().toISOString(),
    }),
  );
  await handle.sync();
  await handle.close();
  await syncDirectory(dirname(target));
  return async () => {
    const owner = await optionalRead(target);
    if (owner && JSON.parse(owner.toString()).token === token) {
      await unlink(target);
      await syncDirectory(dirname(target));
    }
  };
}
function blockingDiagnostics(
  diagnostics: Diagnostic[],
  changes: Operation["changes"],
  rollback: boolean,
  deferredDiagnostics: string[] = [],
): Diagnostic[] {
  // A stale gate in an untouched action is pending human work, not corruption.
  // Never permit work on that action to bypass its own approval.
  const touched = new Set(
    changes
      .filter((c) => c.before !== c.after)
      .map(
        (c) =>
          /^\.voidra\/actions\/(act-[0-9a-hjkmnp-tv-z]{6})\//.exec(c.path)?.[1],
      )
      .filter(Boolean),
  );
  return diagnostics.filter((d) => {
    if (deferredDiagnostics.includes(diagnosticFingerprint(d))) return false;
    const action =
      /^\.voidra\/actions\/(act-[0-9a-hjkmnp-tv-z]{6})\/action\.md$/.exec(
        d.file,
      )?.[1];
    return !(
      action &&
      ["stale-approval", "stale-review"].includes(d.code) &&
      (rollback || !touched.has(action))
    );
  });
}
function validateOverlay(
  files: ProjectFiles,
  changes: Operation["changes"],
  id: string,
  options: WriteOptions,
  rollback = false,
  deferredDiagnostics?: string[],
): void {
  const before = inspectFiles(files, { ignoreOperation: id });
  for (const conflict of before.diagnostics.filter(
    (d) => d.code === "conflict",
  )) {
    if (changes.some((c) => c.path === conflict.file && c.before !== c.after))
      fail(
        "conflict",
        conflict.file,
        "Resolve this conflict outside the app before editing the record",
      );
  }
  const deferred =
    deferredDiagnostics ??
    deferredConflictDiagnostics(before).map(diagnosticFingerprint);
  const overlay = new Map(files);
  for (const change of changes) {
    const content = rollback ? change.before : change.after;
    if (content === null) overlay.delete(change.path);
    else overlay.set(change.path, Buffer.from(content));
  }
  const result = inspectFiles(rollback ? upgradePrototype(overlay) : overlay, {
    ...(options.lifecycles ? { lifecycles: options.lifecycles } : {}),
    ignoreOperation: id,
  });
  const problems = blockingDiagnostics(
    result.diagnostics,
    changes,
    rollback,
    deferred,
  );
  if (problems.length && !emptyProject(overlay, problems, options))
    fail(
      "invalid-overlay",
      problems[0]?.file ?? "",
      `Intended project is invalid: ${problems.map((d) => `${d.file} ${d.field}: ${d.message}`).join("; ")}`,
    );
}
function emptyProject(
  files: ProjectFiles,
  diagnostics: Diagnostic[],
  options: WriteOptions,
): boolean {
  return (
    options.allowEmptyProject === true &&
    ![...files.keys()].some(
      (path) =>
        path.startsWith(".voidra/") && !path.startsWith(".voidra/local/"),
    ) &&
    diagnostics.every(
      (d) => d.code === "required-file" && d.file === ".voidra/voidra.json",
    )
  );
}
async function assertVersion(
  root: string,
  allowPrototype = false,
): Promise<void> {
  const target = await safePath(root, ".voidra/voidra.json");
  const bytes = await optionalRead(target);
  if (!bytes) return;
  const metadata = schemas.project.parse(
    parseRecord(".voidra/voidra.json", bytes).data,
  );
  const checked = inspectFiles(new Map([[".voidra/voidra.json", bytes]]));
  const gate = checked.diagnostics.find(
    (d) =>
      d.code === "newer-format" ||
      (d.code === "migration-required" &&
        !(allowPrototype && metadata.format === 0)),
  );
  if (gate) fail(gate.code, gate.file, gate.message);
  if (metadata.format > FORMAT_VERSION)
    fail("newer-format", target, "Unsupported format");
}
async function journal(
  root: string,
  operation: Operation,
  options: WriteOptions,
): Promise<void> {
  const path = `${journalDir}/${operation.id}.json`;
  const old = await optionalRead(await safePath(root, path, false, true));
  await atomicReplace(
    root,
    path,
    `${JSON.stringify(operation, null, 2)}\n`,
    currentHash(old),
    options,
    true,
  );
}
async function readJournal(root: string, id: string): Promise<Operation> {
  if (!/^op-[0-9a-hjkmnp-tv-z]{6}$/.test(id))
    fail("operation", id, "Invalid operation ID");
  const path = `${journalDir}/${id}.json`;
  const raw = await optionalRead(await safePath(root, path, false, true));
  if (!raw) fail("operation", path, "Operation journal does not exist");
  const parsed = schemas.operation.safeParse(
    parseRecord(path, raw as Buffer).data,
  );
  if (!parsed.success) fail("operation", path, "Invalid operation journal");
  const op = parsed.data as Operation;
  if (
    op.id !== id ||
    new Set(op.changes.map((c) => c.path)).size !== op.changes.length ||
    op.changes.some(
      (c) => c.expectedHash !== (c.before === null ? null : hash(c.before)),
    )
  )
    fail("operation", path, "Journal identity or snapshots are invalid");
  return op;
}
async function finish(
  root: string,
  operation: Operation,
  options: WriteOptions,
  rollback = false,
): Promise<OperationResult> {
  options = {
    ...options,
    allowEmptyProject:
      options.allowEmptyProject || operation.allowEmptyProject === true,
  };
  const deferred = z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .parse(operation.deferredDiagnostics ?? []);
  const targets = operation.changes.map((change) => ({
    change,
    wanted: rollback ? change.before : change.after,
  }));
  // Preflight every file before replacing any, so an outside edit cannot cause a partial recovery.
  for (const { change } of targets) {
    const actual = currentHash(
      await optionalRead(
        await safePath(root, change.path, options.allowGlossary),
      ),
    );
    const before = change.before === null ? null : hash(change.before);
    const after = change.after === null ? null : hash(change.after);
    if (actual !== before && actual !== after)
      fail(
        "hash-conflict",
        change.path,
        "Recovery hash conflict: outside edit preserved",
      );
  }
  await options.checkpoint?.("preflight", operation.id);
  const read = await readProjectFiles(root);
  if (read.diagnostics.length)
    fail(
      "symlink",
      read.diagnostics[0]?.file ?? "",
      "Project contains a symlink",
    );
  validateOverlay(
    read.files,
    operation.changes,
    operation.id,
    options,
    rollback,
    deferred,
  );
  for (const { change, wanted } of targets) {
    const actual = await optionalRead(
      await safePath(root, change.path, options.allowGlossary),
    );
    if (
      currentHash(actual) !==
        (change.before === null ? null : hash(change.before)) &&
      currentHash(actual) !==
        (change.after === null ? null : hash(change.after))
    )
      fail(
        "hash-conflict",
        change.path,
        "Recovery hash conflict after preflight",
      );
    if (currentHash(actual) !== (wanted === null ? null : hash(wanted)))
      await atomicReplace(
        root,
        change.path,
        wanted,
        currentHash(actual),
        options,
      );
    await options.checkpoint?.("change-applied", change.path);
  }
  const final = await readProjectFiles(root);
  const checked = inspectFiles(
    rollback ? upgradePrototype(final.files) : final.files,
    {
      ...(options.lifecycles ? { lifecycles: options.lifecycles } : {}),
      ignoreOperation: operation.id,
    },
  );
  const problems = blockingDiagnostics(
    checked.diagnostics,
    operation.changes,
    rollback,
    deferred,
  );
  if (
    final.diagnostics.length ||
    (problems.length && !emptyProject(final.files, problems, options))
  )
    fail(
      "post-validation",
      operation.id,
      "Project changed during operation; explicit recovery required",
    );
  await options.checkpoint?.("before-commit", operation.id);
  operation.state = rollback ? "rolled-back" : "committed";
  await journal(root, operation, options);
  if (!rollback) await operationObserver(root)?.committed(operation.id);
  await options.checkpoint?.("committed", operation.id);
  return { id: operation.id, state: operation.state, alreadyCompleted: false };
}
export async function applyOperation(
  root: string,
  input: WriteManifest,
  options: WriteOptions = {},
  migration = false,
): Promise<OperationResult> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) fail("manifest", "", "Invalid write manifest");
  const manifest = parsed.data as WriteManifest;
  const resolved = await realpath(root);
  await assertVersion(resolved, migration);
  const release = await acquire(resolved, options);
  try {
    await options.checkpoint?.("lock-acquired", lockPath);
    const id =
      manifest.id ??
      createId(
        "op",
        new Set(
          Array.from(
            (await readProjectFiles(resolved)).files.keys(),
            (file) => file.split("/").at(-1)?.replace(".json", "") ?? "",
          ),
        ),
      );
    const fingerprint = hash(
      JSON.stringify({
        changes: manifest.changes,
        allowGlossary: Boolean(options.allowGlossary),
        ...(options.allowEmptyProject ? { allowEmptyProject: true } : {}),
      }),
    );
    const existing = await optionalRead(
      await safePath(resolved, `${journalDir}/${id}.json`, false, true),
    );
    if (existing) {
      const receipt = await readJournal(resolved, id);
      if (receipt.fingerprint !== fingerprint)
        fail("operation", id, "Operation ID was used for a different manifest");
      if (receipt.state === "prepared")
        fail("operation", id, "Incomplete operation; recover it explicitly");
      if (receipt.state === "rolled-back")
        fail("operation", id, "Operation already rolled-back; use a new ID");
      return { id, state: receipt.state, alreadyCompleted: true };
    }
    if (
      new Set(manifest.changes.map((c) => c.path)).size !==
      manifest.changes.length
    )
      fail("manifest", id, "Duplicate write paths");
    const changes: Operation["changes"] = [];
    for (const change of manifest.changes) {
      const before = await optionalRead(
        await safePath(resolved, change.path, options.allowGlossary),
      );
      if (currentHash(before) !== change.expectedHash)
        fail(
          "hash-conflict",
          change.path,
          "Expected hash conflict; current file preserved",
        );
      let content: string | null = null;
      try {
        content =
          before === null
            ? null
            : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
                before,
              );
      } catch {
        fail("encoding", change.path, "Snapshots require valid UTF-8");
      }
      changes.push({
        path: change.path,
        expectedHash: change.expectedHash,
        before: content,
        after: change.content,
      });
    }
    const read = await readProjectFiles(resolved);
    if (read.diagnostics.length)
      fail(
        "symlink",
        read.diagnostics[0]?.file ?? "",
        "Project contains a symlink",
      );
    validateOverlay(read.files, changes, id, options);
    await options.checkpoint?.("validated", id);
    const operation: Operation = {
      id,
      fingerprint,
      state: "prepared",
      changes,
      ...(options.allowEmptyProject ? { allowEmptyProject: true } : {}),
      deferredDiagnostics: deferredConflictDiagnostics(
        inspectFiles(read.files, { ignoreOperation: id }),
      ).map(diagnosticFingerprint),
    };
    const changed = changes.filter((change) => change.before !== change.after);
    if (changed.length)
      await operationObserver(resolved)?.prepared({
        ...operation,
        changes: changed,
      });
    await journal(resolved, operation, options);
    await options.checkpoint?.("journal-prepared", id);
    return await finish(resolved, operation, options);
  } finally {
    await release();
  }
}
export async function recoverOperation(
  root: string,
  id: string,
  options: WriteOptions & { rollback?: boolean } = {},
): Promise<OperationResult> {
  const resolved = await realpath(root);
  await assertVersion(resolved, true);
  if (!/^op-[0-9a-hjkmnp-tv-z]{6}$/.test(id))
    fail("operation", id, "Invalid operation ID");
  const release = await acquire(resolved, options, true);
  try {
    const operation = await readJournal(resolved, id);
    const wanted = options.rollback ? "rolled-back" : "committed";
    if (operation.state !== "prepared") {
      if (operation.state !== wanted)
        fail("operation", id, `Operation already ${operation.state}`);
      return { id, state: wanted, alreadyCompleted: true };
    }
    return await finish(resolved, operation, options, options.rollback);
  } finally {
    await release();
  }
}
