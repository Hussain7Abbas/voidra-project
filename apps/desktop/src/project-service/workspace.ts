import { existsSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { inspectLock, listRunContexts } from "@voidra/run-engine";
import Database from "better-sqlite3";
import { type FSWatcher, watch } from "chokidar";
import {
  applyOperation,
  checkProject,
  createId,
  FORMAT_VERSION,
  hash,
  PACKAGE_VERSION,
  parseRecord,
  schemas,
  serializeRecord,
  transition,
} from "voidra";
import {
  type WorkspaceRequest,
  type WorkspaceSnapshot,
  workspaceSchema,
} from "../shared/bridge.ts";

const INDEX_VERSION = 1;
export class ProjectWorkspace {
  private database: Database.Database;
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private delivered = "";
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private publishQueue: Promise<void> = Promise.resolve();
  private readonly notify: () => void;

  readonly root: string;
  readonly databasePath: string;
  constructor(
    root: string,
    databasePath: string,
    notify: () => void = () => {},
  ) {
    this.notify = notify;
    this.root = root;
    this.databasePath = databasePath;
    this.database = this.open();
  }
  async start(): Promise<void> {
    this.watcher = watch(join(this.root, ".voidra"), {
      ignoreInitial: true,
      followSymlinks: false,
      atomic: 75,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 25 },
    });
    const watcher = this.watcher;
    watcher.on("all", () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.publish().catch(() => this.notify());
      }, 100);
    });
    await new Promise<void>((resolve, reject) => {
      watcher.once("ready", resolve);
      watcher.once("error", reject);
    });
    await this.publish(false);
    this.heartbeatTimer = setInterval(() => {
      if (existsSync(join(this.root, ".voidra/local/run.lock")))
        void this.publish().catch(() => this.notify());
    }, 2000);
  }
  publish(announce = true): Promise<void> {
    const next = this.publishQueue.then(async () => {
      const value = JSON.stringify(await this.snapshot());
      if (value !== this.delivered) {
        this.delivered = value;
        if (announce) this.notify();
      }
    });
    this.publishQueue = next.catch(() => {});
    return next;
  }
  private open(): Database.Database {
    let db: Database.Database | undefined;
    try {
      db = new Database(this.databasePath);
      if (db.pragma("quick_check", { simple: true }) !== "ok")
        throw new Error("Corrupt cache");
      if (db.pragma("user_version", { simple: true }) !== INDEX_VERSION) {
        db.exec("drop table if exists actions; drop table if exists runs;");
        db.pragma(`user_version = ${INDEX_VERSION}`);
      }
    } catch {
      db?.close();
      unlinkSync(this.databasePath);
      db = new Database(this.databasePath);
      db.pragma(`user_version = ${INDEX_VERSION}`);
    }
    db.exec(
      "create table if not exists actions (id text primary key, value text not null); create table if not exists runs (id text primary key, action text not null, value text not null);",
    );
    return db;
  }
  async handle(request: WorkspaceRequest): Promise<WorkspaceSnapshot> {
    if (request.command === "create-voidra") await this.initialize();
    if (request.command === "review-action")
      await this.reviewAction(
        request.id,
        request.decision,
        request.revision,
        request.feedback,
      );
    if (request.command === "queue-action") await this.queueAction(request.id);
    if (request.command === "create-action")
      await this.createAction(request.title, request.description);
    return this.snapshot();
  }
  async reviewAction(
    id: string,
    decision: "accepted" | "rejected",
    revision: string,
    feedback: string,
  ): Promise<void> {
    const displayed = await this.snapshot();
    if (displayed.readOnly || displayed.lock.state !== "none")
      throw new Error("Finish or recover the run before deciding its review");
    const view = displayed.actions.find((action) => action.data.id === id);
    if (!view || view.revision !== revision)
      throw new Error("Review revision changed; read the current result first");
    const project = await checkProject(this.root),
      doc = project.records.get(view.path)?.document;
    if (!doc) throw new Error("Action not found");
    const action = schemas.action.parse(doc.data);
    if (action.type !== "docs")
      throw new Error("This version reviews Docs/chore only");
    const runs = [...project.records.values()].filter(
      (record) => record.kind === "run" && record.document.data.action === id,
    );
    const currentRevision = hash(
      JSON.stringify(
        [view.path, ...runs.map((run) => run.document.file)]
          .sort()
          .map((path) => [path, hash(project.files.get(path) ?? "")]),
      ),
    );
    if (currentRevision !== revision)
      throw new Error("Review revision changed before writing");
    if (
      !runs.some(
        (run) =>
          run.document.data.outcome === "advanced" &&
          typeof run.document.data.commit === "string",
      )
    )
      throw new Error("A completed, committed run is required before review");
    if (decision === "rejected" && !feedback.trim())
      throw new Error("Explain the change needed before rejecting");
    const next = transition(
      action,
      decision === "accepted" ? "accept-review" : "reject-review",
      {
        revision,
        reviewRevision: revision,
        by: "You",
        at: new Date().toISOString(),
      },
    ).action;
    if (next.reviewDecision && decision === "rejected")
      next.reviewDecision.feedback = feedback;
    await applyOperation(this.root, {
      changes: [
        {
          path: view.path,
          expectedHash: hash(doc.raw),
          content: serializeRecord(doc, next).toString(),
        },
        ...runs.map((run) => ({
          path: run.document.file,
          expectedHash: hash(run.document.raw),
          content: run.document.raw,
        })),
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      ],
    });
    await this.publish();
  }
  async queueAction(id: string): Promise<void> {
    const project = await checkProject(this.root);
    if (project.diagnostics.length)
      throw new Error("Fix the planning-file problems before queueing");
    const actionPath = `.voidra/actions/${id}/action.md`,
      record = project.records.get(actionPath);
    if (record?.kind !== "action") throw new Error("Action not found");
    const action = schemas.action.parse(record.document.data);
    if (
      action.doneBy !== "agent" ||
      !["ready", "draft", "failed"].includes(action.status) ||
      ["review", "done", "released", "cancelled"].includes(action.stage ?? "")
    )
      throw new Error("This action cannot be queued at its current gate");
    for (const dependency of action.blockedBy ?? []) {
      const data = project.records.get(
        `.voidra/actions/${dependency}/action.md`,
      )?.document.data;
      if (
        data?.status !== "complete" ||
        !["done", "released"].includes(String(data.stage))
      )
        throw new Error("Finish the blocking actions before queueing");
    }
    const path = ".voidra/local/pending-actions.md",
      old = project.files.get(path);
    const queue = old
      ? parseRecord(path, old)
      : parseRecord(path, "---\n{}\n---\n");
    const ids = Array.from(
      queue.body.matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g),
      (match) => match[0],
    );
    if (!ids.includes(id)) ids.push(id);
    const content = serializeRecord(
      queue,
      { ...queue.data, queuedBy: "You", queuedAt: new Date().toISOString() },
      `${ids.map((value, index) => `${index + 1}. [ ] ${value}`).join("\n")}\n`,
    ).toString();
    await applyOperation(this.root, {
      changes: [
        { path, expectedHash: old ? hash(old) : null, content },
        {
          path: actionPath,
          expectedHash: hash(record.document.raw),
          content: record.document.raw,
        },
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      ],
    });
    await this.publish();
  }
  async createAction(title: string, description: string): Promise<void> {
    const project = await checkProject(this.root);
    if (project.diagnostics.length)
      throw new Error(
        "Fix the planning-file problems before creating an action",
      );
    const ids = new Set(
      [...project.records.values()].map((r) => String(r.document.data.id)),
    );
    const action = schemas.action.parse({
      id: createId("act", ids),
      title,
      type: "docs",
      stage: "implement",
      status: "ready",
      doneBy: "agent",
      createdAt: new Date().toISOString(),
      createdBy: "You",
    });
    const path = `.voidra/actions/${action.id}/action.md`;
    const content = serializeRecord(
      parseRecord(path, "---\n{}\n---\n"),
      action,
      description,
    ).toString();
    await applyOperation(this.root, {
      changes: [{ path, expectedHash: null, content }],
    });
    await this.publish();
  }
  async initialize(): Promise<void> {
    const existing = await checkProject(this.root);
    if (
      existing.files.size ||
      existing.diagnostics.some((d) => d.code !== "required-file")
    )
      throw new Error(
        "Planning files already exist or need repair; no files were replaced",
      );
    const metadata = schemas.project.parse({
      format: FORMAT_VERSION,
      requiredVoidra: PACKAGE_VERSION,
      project: { id: createId("prj"), name: basename(this.root) },
      template: null,
      createdWith: "voidra-project/0.1.0",
    });
    await applyOperation(this.root, {
      changes: [
        {
          path: ".voidra/voidra.json",
          expectedHash: null,
          content: `${JSON.stringify(metadata, null, 2)}\n`,
        },
        {
          path: ".voidra/README.md",
          expectedHash: null,
          content:
            "# Voidra planning\n\nThis folder holds project planning and tracking records. Local queues, locks and recovery journals are never committed. Use `npx voidra@0 check` to validate it.\n",
        },
        { path: ".voidra/.gitignore", expectedHash: null, content: "local/\n" },
      ],
    });
    await this.publish();
  }
  async snapshot(): Promise<WorkspaceSnapshot> {
    if (!existsSync(this.databasePath)) {
      this.database.close();
      this.database = this.open();
    }
    const project = await checkProject(this.root);
    const hasVoidra = project.files.size > 0;
    let runPending = false;
    const recoveries: WorkspaceSnapshot["recoveries"] = [];
    const lockData = project.records.get(".voidra/local/run.lock")?.document
      .data;
    const lock = await inspectLock(
      lockData ?? (project.files.has(".voidra/local/run.lock") ? {} : null),
    );
    for (const record of project.records.values()) {
      if (
        record.kind === "operation" &&
        record.document.data.state === "prepared"
      )
        recoveries.push({
          kind: "operation",
          id: String(record.document.data.id),
          recoverable: true,
          message:
            "A grouped write was interrupted; complete or roll it back before continuing.",
        });
    }
    try {
      const contexts = await listRunContexts(this.root);
      for (const ctx of contexts) {
        const final =
          ["unsupported", "failed", "interrupted"].includes(ctx.phase) ||
          (ctx.phase === "finalized" && ctx.indexReconciled);
        if (
          !final &&
          (ctx.phase !== "started" ||
            lock.run !== ctx.run ||
            lock.state !== "running")
        ) {
          let owner = lock.run === ctx.run ? lock : undefined;
          if (
            !owner &&
            ctx.ownerPid &&
            ctx.ownerProcessStartedAt &&
            ctx.ownerHost
          )
            owner = await inspectLock({
              pid: ctx.ownerPid,
              processStartedAt: ctx.ownerProcessStartedAt,
              host: ctx.ownerHost,
              ownerToken: ctx.ownerToken,
              agent: ctx.agent,
              run: ctx.run,
              action: ctx.action,
              startedAt: new Date().toISOString(),
              heartbeatAt: new Date().toISOString(),
            });
          recoveries.push({
            kind: "run",
            id: ctx.run,
            recoverable: owner?.recoverable ?? true,
            message:
              ctx.phase === "started"
                ? "The run ended without a completed result."
                : "The prepared result is not finalized. Wait for the owner or recover after it stops.",
          });
        }

        if (
          ["prepared", "commit-pending", "committed"].includes(ctx.phase) ||
          (ctx.phase === "finalized" && !ctx.indexReconciled)
        ) {
          runPending = true;
          project.diagnostics.push({
            code: "incomplete-run",
            file: `.voidra/local/run-checkpoints/${ctx.run}.json`,
            field: "phase",
            line: 1,
            message: `Run ${ctx.run} is not finalized. Recover it before review.`,
          });
        }
      }
    } catch (error) {
      runPending = true;
      project.diagnostics.push({
        code: "invalid-checkpoint",
        file: ".voidra/local/run-checkpoints",
        field: "$",
        line: 1,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const pending =
      runPending ||
      [...project.records.values()].some(
        (r) => r.kind === "operation" && r.document.data.state === "prepared",
      );
    if (!pending)
      this.database.transaction(() => {
        this.database.exec("delete from actions; delete from runs;");
        const addAction = this.database.prepare(
          "insert into actions values (?, ?)",
        );
        const addRun = this.database.prepare(
          "insert into runs values (?, ?, ?)",
        );
        for (const [path, { kind, document }] of project.records) {
          if (kind === "action") {
            const data = schemas.action.parse(document.data);
            addAction.run(
              data.id,
              JSON.stringify({ data, body: document.body, path }),
            );
          }
          if (kind === "run") {
            const data = schemas.run.parse(document.data);
            addRun.run(
              data.id,
              data.action,
              JSON.stringify({ data, body: document.body, path }),
            );
          }
        }
      })();
    const actions = (
      this.database.prepare("select value from actions order by id").all() as {
        value: string;
      }[]
    ).map((row) => {
      const action = JSON.parse(row.value) as { data: { id: string } };
      const runs = (
        this.database
          .prepare("select value from runs where action = ? order by id")
          .all(action.data.id) as { value: string }[]
      ).map((run) => JSON.parse(run.value) as unknown);
      const revision = hash(
        JSON.stringify(
          [action, ...runs]
            .map((record) => (record as { path: string }).path)
            .sort()
            .map((path) => [path, hash(project.files.get(path) ?? "")]),
        ),
      );
      return { ...action, runs, revision };
    });
    return workspaceSchema.parse({
      name: project.metadata?.project.name ?? basename(this.root),
      hasVoidra,
      readOnly: hasVoidra && project.diagnostics.length > 0,
      actions,
      diagnostics: hasVoidra ? project.diagnostics : [],
      recoveries,
      queue: Array.from(
        (
          project.records.get(".voidra/local/pending-actions.md")?.document
            .body ?? ""
        ).matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g),
        (match) => match[0],
      ),
      lock,
    });
  }
  async close(): Promise<void> {
    clearTimeout(this.timer);
    clearInterval(this.heartbeatTimer);
    await this.watcher?.close();
    await this.publishQueue;
    this.database.close();
  }
}
