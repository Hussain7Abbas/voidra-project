import { readFile } from "node:fs/promises";
import type Database from "better-sqlite3";
import {
  ACTION_QUEUE_PATH,
  ACTION_SEQUENCE_PATH,
  applyOperation,
  checkProject,
  createId,
  hash,
  type OperationObserver,
  type ProjectInspection,
  parseRecord,
  safePath,
  withOperationObserver,
} from "voidra";
import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const changeSchema = z.object({
  path: z.string(),
  before: digest.nullable(),
  after: digest.nullable(),
});
const changesSchema = z.array(changeSchema).min(1);
interface Row {
  seq: number;
  id: string;
  label: string;
  at: string;
  runs: string;
  changes: string;
  state: string;
  replay_id: string | null;
  replay_direction: "undo" | "redo" | null;
}
export interface HistoryEntry {
  label: string | null;
  revision: string | null;
  blocked: string | null;
  conflicts: string[];
  overwriteRevision: string | null;
}
export interface HistoryState {
  undo: HistoryEntry;
  redo: HistoryEntry;
  notice: string | null;
}
const empty = (): HistoryEntry => ({
  label: null,
  revision: null,
  blocked: null,
  conflicts: [],
  overwriteRevision: null,
});
const runIds = (project: ProjectInspection): string[] =>
  [...project.records.values()]
    .filter((r) => r.kind === "run" || r.kind === "sync")
    .map((r) => String(r.document.data.id));
const historyPath = (path: string): boolean =>
  path.startsWith(".voidra/") &&
  (!path.startsWith(".voidra/local/") ||
    path === ACTION_QUEUE_PATH ||
    path === ACTION_SEQUENCE_PATH ||
    path === ".voidra/local/release-selection.json");

/** Local app history. The format writer still owns every file mutation. */
export class UndoHistory {
  private notice: string | null = null;
  private readonly root: string;
  private readonly db: Database.Database;
  constructor(root: string, db: Database.Database) {
    this.root = root;
    this.db = db;
    this.tables();
    try {
      for (const row of this.rows()) {
        this.changes(row);
        z.array(z.string()).parse(JSON.parse(row.runs));
        if (!["prepared", "applied", "undone", "discarded"].includes(row.state))
          throw new Error("Invalid history state");
      }
      for (const blob of db
        .prepare("select hash, content from undo_blobs")
        .all() as { hash: string; content: Buffer }[])
        if (hash(blob.content) !== blob.hash)
          throw new Error("Invalid history body");
    } catch {
      db.exec(
        "drop table if exists undo_operations; drop table if exists undo_blobs",
      );
      this.tables();
      this.notice =
        "Undo history was damaged and has been cleared. Your project files are unchanged.";
    }
  }
  private tables(): void {
    this.db.exec(`create table if not exists undo_blobs (hash text primary key, content blob not null);
      create table if not exists undo_operations (seq integer primary key autoincrement, id text unique not null,
      label text not null, at text not null, runs text not null, changes text not null, state text not null,
      replay_id text, replay_direction text)`);
  }
  private rows(): Row[] {
    return this.db
      .prepare("select * from undo_operations order by seq")
      .all() as Row[];
  }
  private changes(row: Row): z.infer<typeof changesSchema> {
    const changes = changesSchema.parse(JSON.parse(row.changes));
    if (
      changes.some((c) => !historyPath(c.path)) ||
      new Set(changes.map((c) => c.path)).size !== changes.length
    )
      throw new Error("Unsafe history path");
    for (const change of changes)
      for (const key of [change.before, change.after])
        if (key !== null) this.content(key);
    return changes;
  }
  private content(key: string | null): string | null {
    if (key === null) return null;
    const blob = this.db
      .prepare("select content from undo_blobs where hash=?")
      .get(key) as { content: Buffer } | undefined;
    if (!blob || hash(blob.content) !== key)
      throw new Error("Undo history body is missing or damaged");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      blob.content,
    );
  }
  private prune(): void {
    this.db
      .prepare("delete from undo_operations where state='discarded'")
      .run();
    const collect = (): void => {
      const keys = new Set(
        this.rows()
          .flatMap((row) =>
            this.changes(row).flatMap((c) => [c.before, c.after]),
          )
          .filter((k) => k !== null),
      );
      for (const blob of this.db
        .prepare("select hash from undo_blobs")
        .all() as { hash: string }[])
        if (!keys.has(blob.hash))
          this.db.prepare("delete from undo_blobs where hash=?").run(blob.hash);
    };
    collect();
    while (
      this.rows().length > 100 ||
      Number(
        (
          this.db
            .prepare(
              "select coalesce(sum(length(content)),0) as size from undo_blobs",
            )
            .get() as { size: number }
        ).size,
      ) >
        32 * 1024 * 1024
    ) {
      const oldest = this.rows().find(
        (row) => row.state !== "prepared" && !row.replay_id,
      );
      if (!oldest || this.rows().length === 1) break;
      this.db
        .prepare("delete from undo_operations where seq=?")
        .run(oldest.seq);
      collect();
    }
  }
  async perform<T>(
    label: string,
    edit: () => Promise<T>,
    observer?: OperationObserver,
  ): Promise<T> {
    await this.reconcile();
    return withOperationObserver(
      this.root,
      {
        prepared: async (operation) => {
          // The selection token is serialization bookkeeping, not an undoable decision.
          const changes = operation.changes.filter(
            (c) =>
              c.before !== c.after &&
              c.path !== ".voidra/local/release-selection.json",
          );
          if (!changes.length) return;
          if (changes.some((c) => !historyPath(c.path)))
            throw new Error(
              "App history cannot write source or recovery files",
            );
          const bytes = new Map<string, Buffer>();
          const stored = changes.map((change) => {
            const key = (body: string | null): string | null => {
              if (body === null) return null;
              const value = Buffer.from(body);
              const digest = hash(value);
              bytes.set(digest, value);
              return digest;
            };
            return {
              path: change.path,
              before: key(change.before),
              after: key(change.after),
            };
          });
          if (
            [...bytes.values()].reduce((sum, b) => sum + b.length, 0) >
            32 * 1024 * 1024
          )
            throw new Error("This edit exceeds the 32 MiB undo history limit");
          const runs = runIds(await checkProject(this.root));
          this.db.transaction(() => {
            for (const [key, content] of bytes)
              this.db
                .prepare("insert or ignore into undo_blobs values (?,?)")
                .run(key, content);
            this.db
              .prepare(
                "insert into undo_operations (id,label,at,runs,changes,state) values (?,?,?,?,?,'prepared')",
              )
              .run(
                operation.id,
                label,
                new Date().toISOString(),
                JSON.stringify(runs),
                JSON.stringify(stored),
              );
          })();
          await observer?.prepared(operation);
        },
        committed: async (id) => {
          this.db.transaction(() => {
            const row = this.db
              .prepare("select * from undo_operations where id=?")
              .get(id) as Row | undefined;
            if (row?.state !== "prepared") return;
            this.db
              .prepare(
                "update undo_operations set state='discarded' where state='undone'",
              )
              .run();
            this.db
              .prepare("update undo_operations set state='applied' where id=?")
              .run(id);
            this.prune();
          })();
          await observer?.committed(id);
        },
      },
      edit,
    );
  }
  private async reconcile(): Promise<void> {
    const pending = this.rows().filter(
      (r) => r.state === "prepared" || r.replay_id,
    );
    if (!pending.length) return;
    const project = await checkProject(this.root);
    for (const row of pending) {
      const id = row.replay_id ?? row.id;
      const raw = project.files.get(`.voidra/local/operations/${id}.json`);
      const receipt = raw
        ? (JSON.parse(raw.toString()) as { state?: string })
        : undefined;
      if (receipt?.state === "prepared") continue;
      if (row.replay_id) {
        if (receipt?.state === "committed")
          this.db
            .prepare(
              "update undo_operations set state=?,replay_id=null,replay_direction=null where id=?",
            )
            .run(
              row.replay_direction === "undo" ? "undone" : "applied",
              row.id,
            );
        else
          this.db
            .prepare(
              "update undo_operations set replay_id=null,replay_direction=null where id=?",
            )
            .run(row.id);
      } else if (receipt?.state === "committed") {
        this.db
          .prepare(
            "update undo_operations set state='discarded' where state='undone'",
          )
          .run();
        this.db
          .prepare("update undo_operations set state='applied' where id=?")
          .run(row.id);
      } else
        this.db.prepare("delete from undo_operations where id=?").run(row.id);
    }
    this.prune();
  }
  private candidate(direction: "undo" | "redo"): Row | undefined {
    return this.db
      .prepare(
        `select * from undo_operations where state=? order by seq ${direction === "undo" ? "desc" : "asc"} limit 1`,
      )
      .get(direction === "undo" ? "applied" : "undone") as Row | undefined;
  }
  private async inspect(
    row: Row,
    direction: "undo" | "redo",
    project: ProjectInspection,
  ): Promise<HistoryEntry> {
    const changes = this.changes(row),
      beforeRuns = z.array(z.string()).parse(JSON.parse(row.runs));
    const affected = new Set(
      changes.flatMap((c) =>
        [
          c.path,
          ...c.path.matchAll(/(?:act|idea|q)-[0-9a-hjkmnp-tv-z]{6}/g),
        ].map((v) => (typeof v === "string" ? v : v[0])),
      ),
    );
    for (const change of changes)
      for (const body of [
        this.content(change.before),
        this.content(change.after),
      ])
        for (const id of body?.matchAll(
          /(?:act|idea|q)-[0-9a-hjkmnp-tv-z]{6}/g,
        ) ?? [])
          affected.add(id[0]);
    let blocked: string | null = null;
    for (const record of project.records.values())
      if (
        (record.kind === "run" || record.kind === "sync") &&
        !beforeRuns.includes(String(record.document.data.id))
      ) {
        const consumed = Array.isArray(record.document.data.consumedRecords)
          ? [...record.document.data.consumedRecords]
          : [];
        if (record.kind === "run" && record.document.data.orderedIntent)
          consumed.push(ACTION_SEQUENCE_PATH, ACTION_QUEUE_PATH);
        if (
          Array.isArray(consumed) &&
          consumed.some((v) => typeof v === "string" && affected.has(v))
        ) {
          blocked = `${record.kind === "sync" ? "Sync" : "Run"} ${String(record.document.data.id)} consumed this edit. Create a revert action for finished work.`;
          break;
        }
      }
    if (
      !blocked &&
      (project.files.has(".voidra/local/run.lock") ||
        project.files.has(".voidra/local/planning.lock") ||
        project.diagnostics.some((d) => d.code === "incomplete-operation"))
    )
      blocked = "Finish or recover pending work before undo or redo.";
    const current: { path: string; hash: string | null }[] = [];
    const conflicts: string[] = [];
    for (const change of changes) {
      let body: Buffer | null = null;
      try {
        body = await readFile(await safePath(this.root, change.path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const actual = body === null ? null : hash(body),
        expected = direction === "undo" ? change.after : change.before;
      current.push({ path: change.path, hash: actual });
      if (actual !== expected) {
        conflicts.push(change.path);
        const target = direction === "undo" ? change.before : change.after;
        if (target === null && body !== null && !blocked)
          blocked =
            "A file changed outside this edit would be deleted. Preserve it and create a revert action.";
        if (change.path.endsWith("/action.md")) {
          const record = project.records.get(change.path),
            stage = record?.document.data.stage;
          const snapshot = this.content(expected);
          if (
            stage &&
            snapshot &&
            parseRecord(change.path, snapshot).data.stage !== stage &&
            !blocked
          )
            blocked =
              "This action advanced outside the edit. Create a revert action for finished work.";
        }
      }
    }
    return {
      label: row.label,
      revision: hash(
        JSON.stringify({ id: row.id, direction, state: row.state, changes }),
      ),
      blocked,
      conflicts,
      overwriteRevision: conflicts.length
        ? hash(JSON.stringify({ id: row.id, direction, current }))
        : null,
    };
  }
  async state(): Promise<HistoryState> {
    await this.reconcile();
    const undo = this.candidate("undo"),
      redo = this.candidate("redo");
    if (!undo && !redo)
      return { undo: empty(), redo: empty(), notice: this.notice };
    const project = await checkProject(this.root);
    return {
      undo: undo ? await this.inspect(undo, "undo", project) : empty(),
      redo: redo ? await this.inspect(redo, "redo", project) : empty(),
      notice: this.notice,
    };
  }
  async replay(
    direction: "undo" | "redo",
    revision: string,
    overwriteRevision?: string,
  ): Promise<void> {
    await this.reconcile();
    const row = this.candidate(direction);
    if (!row) throw new Error(`Nothing to ${direction}`);
    const project = await checkProject(this.root),
      entry = await this.inspect(row, direction, project);
    if (entry.revision !== revision)
      throw new Error("Undo history changed; refresh before continuing");
    if (entry.blocked) throw new Error(entry.blocked);
    if (entry.conflicts.length && overwriteRevision !== entry.overwriteRevision)
      throw new Error(
        "Files changed on disk; confirm the current changes before overwriting",
      );
    const changes = [];
    for (const change of this.changes(row)) {
      let bytes: Buffer | null = null;
      try {
        bytes = await readFile(await safePath(this.root, change.path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      changes.push({
        path: change.path,
        expectedHash: bytes === null ? null : hash(bytes),
        content: this.content(
          direction === "undo" ? change.before : change.after,
        ),
      });
    }
    const touched = new Set(changes.map((c) => c.path));
    for (const [path, bytes] of project.files)
      if (!path.startsWith(".voidra/local/") && !touched.has(path))
        changes.push({
          path,
          expectedHash: hash(bytes),
          content: bytes.toString(),
        });
    for (const path of [
      ".voidra/local/run.lock",
      ".voidra/local/planning.lock",
    ])
      changes.push({ path, expectedHash: null, content: null });
    const id = createId(
      "op",
      new Set(this.rows().flatMap((r) => [r.id, r.replay_id ?? ""])),
    );
    this.db
      .prepare(
        "update undo_operations set replay_id=?,replay_direction=? where id=?",
      )
      .run(id, direction, row.id);
    await applyOperation(
      this.root,
      { id, changes },
      {
        allowEmptyProject: true,
        checkpoint: async (point) => {
          if (point !== "lock-acquired") return;
          const latest = await this.inspect(
            row,
            direction,
            await checkProject(this.root),
          );
          if (latest.blocked) throw new Error(latest.blocked);
          if (
            latest.conflicts.length &&
            latest.overwriteRevision !== overwriteRevision
          )
            throw new Error("Files changed on disk; refresh the confirmation");
        },
      },
    );
    this.db
      .prepare(
        "update undo_operations set state=?,replay_id=null,replay_direction=null where id=?",
      )
      .run(direction === "undo" ? "undone" : "applied", row.id);
  }
}
