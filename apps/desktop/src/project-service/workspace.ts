import { existsSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectLock,
  listRunContexts,
  readGitIdentity,
} from "@voidra/run-engine";
import Database from "better-sqlite3";
import { type FSWatcher, watch } from "chokidar";
import {
  actionComplete,
  answerQuestion,
  applyOperation,
  approveAction,
  checkProject,
  createId,
  createIdea,
  createAction as createPlanningAction,
  decideReview,
  detectCode,
  editAction,
  editIdea,
  FORMAT_VERSION,
  hash,
  initializeProject,
  lifecycles,
  PACKAGE_VERSION,
  parseRecord,
  planFiles,
  projectLifecycles,
  promoteIdea,
  readPlan,
  readTemplates,
  requestPlanChanges,
  reviewRevision,
  schemas,
  serializeRecord,
  setHumanStep,
  updateProfileAnswer,
} from "voidra";
import {
  type WorkspaceRequest,
  type WorkspaceSnapshot,
  workspaceSchema,
} from "../shared/bridge.ts";

declare const __voidraTemplatesRoot: string | undefined;
const INDEX_VERSION = 4;
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
  readonly templatesDirectory: string;
  constructor(
    root: string,
    databasePath: string,
    notify: () => void = () => {},
    templatesDirectory = typeof __voidraTemplatesRoot !== "undefined"
      ? __voidraTemplatesRoot
      : fileURLToPath(new URL("../../../../templates/", import.meta.url)),
  ) {
    this.notify = notify;
    this.templatesDirectory = templatesDirectory;
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
        db.exec(
          "drop table if exists actions; drop table if exists runs; drop table if exists profiles; drop table if exists ideas;",
        );
        db.pragma(`user_version = ${INDEX_VERSION}`);
      }
    } catch {
      db?.close();
      unlinkSync(this.databasePath);
      db = new Database(this.databasePath);
      db.pragma(`user_version = ${INDEX_VERSION}`);
    }
    db.exec(
      "create table if not exists actions (id text primary key, value text not null); create table if not exists runs (id text primary key, action text not null, value text not null); create table if not exists profiles (id text primary key, value text not null); create table if not exists ideas (id text primary key, value text not null);",
    );
    return db;
  }
  async handle(request: WorkspaceRequest): Promise<WorkspaceSnapshot> {
    if (
      ["answer-question", "approve-plan", "reject-plan"].includes(
        request.command,
      )
    ) {
      const current = await this.snapshot();
      if (
        current.lock.state !== "none" ||
        current.recoveries.length ||
        current.diagnostics.some(
          (d) => !["stale-approval", "stale-review"].includes(d.code),
        )
      )
        throw new Error("Finish or recover pending work before deciding");
      if (request.command === "answer-question")
        await answerQuestion(this.root, {
          action: request.id,
          question: request.question,
          revision: request.revision,
          answer: request.answer,
          by: "You",
        });
      if (request.command === "approve-plan")
        await approveAction(this.root, request.id, "You", request.revision);
      if (request.command === "reject-plan")
        await requestPlanChanges(
          this.root,
          request.id,
          request.revision,
          request.feedback,
          "You",
        );
      await this.publish();
    }
    if (
      request.command === "edit-action" ||
      request.command === "set-human-step"
    ) {
      const current = await this.snapshot();
      if (
        current.readOnly ||
        current.lock.state !== "none" ||
        current.recoveries.length
      )
        throw new Error(
          "Finish or recover pending work before changing actions",
        );
      if (request.command === "edit-action")
        await editAction(this.root, {
          id: request.id,
          revision: request.revision,
          title: request.title,
          description: request.description,
          assignee: request.assignee,
          parent: request.parent,
          blockedBy: request.blockedBy,
          cancel: request.cancel,
        });
      else
        await setHumanStep(this.root, {
          id: request.id,
          revision: request.revision,
          step: request.step,
          done: request.done,
        });
      await this.publish();
    }
    if (
      request.command === "create-idea" ||
      request.command === "edit-idea" ||
      request.command === "promote-idea"
    ) {
      const current = await this.snapshot();
      if (
        current.readOnly ||
        current.lock.state !== "none" ||
        current.recoveries.length
      )
        throw new Error("Finish or recover pending work before editing ideas");
      if (request.command === "create-idea")
        await createIdea(this.root, {
          title: request.title,
          description: request.description,
          status: request.status,
          reason: request.reason,
          by: "You",
        });
      else if (request.command === "promote-idea")
        await promoteIdea(this.root, {
          id: request.id,
          revision: request.revision,
          type: request.type,
          title: request.title,
          description: request.description,
          by: "You",
        });
      else
        await editIdea(this.root, {
          id: request.id,
          revision: request.revision,
          title: request.title,
          description: request.description,
          status: request.status,
          reason: request.reason,
        });
      await this.publish();
    }
    if (request.command === "initialize-profile") {
      const catalog = await readTemplates(this.templatesDirectory),
        template = catalog.templates.find((t) => t.id === request.template);
      if (!template)
        throw new Error(
          "Template not available; inspect its validation message",
        );
      await initializeProject(this.root, template, {
        name: request.name,
        answers: Object.fromEntries(
          Object.entries(request.answers).map(([key, value]) => [
            key,
            { value },
          ]),
        ),
        bootstrap: !(await detectCode(this.root)).hasCode,
      });
    }
    if (request.command === "edit-profile-answer") {
      const current = await this.snapshot();
      if (
        current.readOnly ||
        current.lock.state !== "none" ||
        current.recoveries.length
      )
        throw new Error(
          "Finish or recover the run before changing the profile",
        );
      const catalog = await readTemplates(this.templatesDirectory),
        template = catalog.templates.find(
          (t) =>
            t.id === current.template?.id &&
            t.version === current.template.version,
        );
      if (!template)
        throw new Error("This project's template version is not installed");
      await updateProfileAnswer(this.root, template, {
        block: request.block,
        id: request.id,
        value: request.value,
        by: "You",
        expectedHash: request.revision,
      });
    }
    if (request.command === "create-voidra") await this.initialize();
    if (request.command === "review-action")
      await this.reviewAction(
        request.id,
        request.decision,
        request.revision,
        request.feedback,
      );
    if (request.command === "queue-action")
      await this.queueAction(request.id, request.revision);
    if (request.command === "create-action")
      await this.createAction(request.title, request.description, request);
    return this.snapshot();
  }
  async reviewAction(
    id: string,
    decision: "accepted" | "rejected",
    revision: string,
    feedback: string,
  ): Promise<void> {
    const displayed = await this.snapshot();
    if (
      displayed.lock.state !== "none" ||
      displayed.recoveries.length ||
      displayed.diagnostics.some(
        (d) => !["stale-approval", "stale-review"].includes(d.code),
      )
    )
      throw new Error(
        "Finish or recover pending work before deciding its review",
      );
    await decideReview(this.root, id, revision, decision, feedback, "You");
    await this.publish();
  }
  async queueAction(id: string, revision?: string): Promise<void> {
    const project = await checkProject(this.root);
    if (
      project.diagnostics.some(
        (d) =>
          !["stale-approval", "stale-review"].includes(d.code) ||
          d.file.startsWith(`.voidra/actions/${id}/`),
      )
    )
      throw new Error(
        "Fix this action’s planning-file problems before queueing",
      );
    const actionPath = `.voidra/actions/${id}/action.md`,
      record = project.records.get(actionPath);
    if (record?.kind !== "action") throw new Error("Action not found");
    const action = schemas.action.parse(record.document.data);
    if (
      action.doneBy !== "agent" ||
      !["ready", "draft", "failed"].includes(action.status) ||
      ["done", "released", "cancelled"].includes(action.stage ?? "")
    )
      throw new Error("This action cannot be queued at its current gate");
    const activate =
      action.type === "profile-change" && action.status === "draft";
    if (activate && (!revision || revision !== hash(record.document.raw)))
      throw new Error(
        "Review the current Profile change draft before activating it",
      );
    for (const dependency of action.blockedBy ?? []) {
      const data = project.records.get(
        `.voidra/actions/${dependency}/action.md`,
      )?.document.data;
      if (!data || !actionComplete(schemas.action.parse(data)))
        throw new Error("Finish the blocking actions before queueing");
    }
    if (
      [...project.records.values()].some(
        (r) =>
          r.kind === "action" &&
          r.document.data.parent === id &&
          !actionComplete(schemas.action.parse(r.document.data)),
      )
    )
      throw new Error("Complete the child slices before queueing their parent");
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
        ...[...new Set(action.blockedBy ?? [])].map((id) => {
          const file = `.voidra/actions/${id}/action.md`,
            bytes = project.files.get(file);
          return {
            path: file,
            expectedHash: bytes ? hash(bytes) : null,
            content: bytes?.toString() ?? null,
          };
        }),
        {
          path: actionPath,
          expectedHash: hash(record.document.raw),
          content: activate
            ? serializeRecord(record.document, {
                ...action,
                status: "ready",
                activatedBy: "You",
                activatedAt: new Date().toISOString(),
              }).toString()
            : record.document.raw,
        },
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      ],
    });
    await this.publish();
  }
  async createAction(
    title: string,
    description: string,
    options?: Extract<WorkspaceRequest, { command: "create-action" }>,
  ): Promise<void> {
    const current = await this.snapshot();
    if (
      current.readOnly ||
      current.lock.state !== "none" ||
      current.recoveries.length
    )
      throw new Error("Finish or recover pending work before creating actions");
    await createPlanningAction(this.root, {
      title,
      description,
      type: options?.type ?? "docs",
      doneBy: options?.doneBy ?? "agent",
      by: "You",
      assignee: options?.assignee,
      steps: options?.steps,
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
    const catalog = await readTemplates(this.templatesDirectory),
      code = hasVoidra
        ? { hasCode: false, evidence: [] }
        : await detectCode(this.root);
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
        this.database.exec(
          "delete from actions; delete from runs; delete from profiles; delete from ideas;",
        );
        const addAction = this.database.prepare(
          "insert into actions values (?, ?)",
        );
        const addRun = this.database.prepare(
          "insert into runs values (?, ?, ?)",
        );
        const addProfile = this.database.prepare(
          "insert into profiles values (?, ?)",
        );
        const addIdea = this.database.prepare(
          "insert into ideas values (?, ?)",
        );
        for (const [path, { kind, document }] of project.records) {
          if (
            project.diagnostics.some(
              (d) =>
                d.file === path &&
                ["identity", "duplicate-id"].includes(d.code),
            )
          )
            continue;
          if (kind === "idea") {
            const data = schemas.idea.parse(document.data);
            addIdea.run(
              data.id,
              JSON.stringify({ data, body: document.body, path }),
            );
          }
          if (kind === "profile") {
            const data = schemas.profile.parse(document.data);
            addProfile.run(
              data.block,
              JSON.stringify({ data, body: document.body, path }),
            );
          }
          if (kind === "action") {
            const data = schemas.action.parse(document.data);
            addAction.run(
              data.id,
              JSON.stringify({
                data,
                body: document.body,
                path,
                questions: (() => {
                  const qPath = `.voidra/actions/${data.id}/questions.md`,
                    q = project.records.get(qPath)?.document;
                  return q
                    ? {
                        path: qPath,
                        revision: hash(q.raw),
                        rounds: schemas.questions.parse(q.data).rounds,
                      }
                    : null;
                })(),
                plans: [...project.records]
                  .filter(
                    ([, r]) =>
                      ["requirements", "blueprint", "acceptance"].includes(
                        r.kind,
                      ) && r.document.data.action === data.id,
                  )
                  .map(([file, r]) => ({
                    name: file.split("/").at(-1),
                    path: file,
                    body: r.document.body,
                  })),
              }),
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
      const action = JSON.parse(row.value) as {
        data: { id: string };
        path: string;
      };
      const runs = (
        this.database
          .prepare("select value from runs where action = ? order by id")
          .all(action.data.id) as { value: string }[]
      ).map((run) => JSON.parse(run.value) as unknown);
      const revision = reviewRevision(project, action.data.id);
      const data = schemas.action.parse(action.data);
      const blockers = (data.blockedBy ?? [])
        .map((id) => project.records.get(`.voidra/actions/${id}/action.md`))
        .filter(Boolean);
      const children = [...project.records.values()].filter(
        (r) => r.kind === "action" && r.document.data.parent === data.id,
      );
      return {
        ...action,
        runs,
        revision,
        editRevision: hash(project.files.get(action.path) ?? ""),
        planRevision:
          readPlan(project.files, data.id, project.records)?.revision ?? null,
        changedPlans: (() => {
          const approved =
            data.planApproval?.hashes ?? data.reviewDecision?.hashes;
          if (approved)
            return planFiles.filter(
              (file) =>
                approved[file] !==
                hash(
                  project.files.get(`.voidra/actions/${data.id}/${file}`) ?? "",
                ),
            );
          return data.type === "release" &&
            data.reviewDecision?.decision === "accepted" &&
            data.reviewDecision.revision !==
              readPlan(project.files, data.id, project.records)?.revision
            ? [...planFiles]
            : [];
        })(),
        effectiveStage: project.diagnostics.some(
          (d) => d.file === action.path && d.code === "stale-approval",
        )
          ? "plan"
          : data.stage,

        timeline:
          data.doneBy === "agent"
            ? (project.diagnostics.some((d) => d.code === "lifecycle")
                ? lifecycles
                : projectLifecycles(project.metadata))[data.type].stages
            : [],
        blocked:
          blockers.some(
            (r) => r && !actionComplete(schemas.action.parse(r.document.data)),
          ) ||
          children.some(
            (r) => !actionComplete(schemas.action.parse(r.document.data)),
          ),
      };
    });
    return workspaceSchema.parse({
      name: project.metadata?.project.name ?? basename(this.root),
      hasVoidra,
      readOnly:
        hasVoidra &&
        project.diagnostics.some(
          (d) => !["stale-approval", "stale-review"].includes(d.code),
        ),
      hasCode: code.hasCode,
      codeEvidence: code.evidence,
      templates: catalog.templates,
      templateProblems: catalog.diagnostics.map(
        (d) => `${d.file} [${d.field}]: ${d.message}`,
      ),
      template: project.metadata?.template ?? null,
      identity: await readGitIdentity(this.root),
      ideas: (
        this.database.prepare("select value from ideas order by id").all() as {
          value: string;
        }[]
      ).map((row) => {
        const idea = JSON.parse(row.value) as { path: string };
        return { ...idea, revision: hash(project.files.get(idea.path) ?? "") };
      }),
      profiles: (
        this.database
          .prepare("select value from profiles order by id")
          .all() as { value: string }[]
      ).map((row) => {
        const profile = JSON.parse(row.value) as { path: string };
        return {
          ...profile,
          revision: hash(project.files.get(profile.path) ?? ""),
        };
      }),
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
