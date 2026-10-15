import { z } from "zod";
import {
  aiContextSchema,
  aiIntentSchema,
  aiReplySchemas,
  aiRequestSchemas,
} from "./ai.ts";
import { draftReplySchemas, draftRequestSchemas } from "./form-drafts.ts";
import { skillReplySchemas, skillRequestSchemas } from "./skills.ts";
import {
  codingClientSchema,
  teamRequestSchemas,
  teamViewSchema,
} from "./team.ts";
import { updateNoticeSchema, updateRequestSchemas } from "./updates.ts";
export const actionTypeSchema = z.enum([
  "feature",
  "bug",
  "improvement",
  "docs",
  "profile-change",
  "research",
  "release",
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const questionViewSchema = z.looseObject({
  id: z.string(),
  text: z.string(),
  why: z.string(),
  options: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      recommended: z.boolean(),
    }),
  ),
  allowFreeText: z.boolean(),
  answer: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("choice"),
        choice: z.string(),
        by: z.string(),
        at: z.string(),
      }),
      z.object({
        kind: z.literal("text"),
        text: z.string(),
        by: z.string(),
        at: z.string(),
      }),
      z.object({
        kind: z.literal("agent-decides"),
        by: z.string(),
        at: z.string(),
      }),
    ])
    .optional(),
  agentChoice: z
    .object({
      choice: z.string(),
      reason: z.string(),
      by: z.string(),
      at: z.string(),
    })
    .optional(),
});
export type QuestionView = z.infer<typeof questionViewSchema>;
const templateViewSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  description: z.string(),
  blocks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      help: z.string(),
      questions: z.array(
        z.object({
          id: z.string(),
          question: z.string(),
          help: z.string(),
          type: z.enum([
            "short-text",
            "long-text",
            "single-choice",
            "multiple-choice",
            "list",
          ]),
          required: z.boolean().optional(),
          allowFreeText: z.boolean().optional(),
          example: z.json().optional(),
          options: z
            .array(z.object({ value: z.string(), label: z.string() }))
            .optional(),
        }),
      ),
    }),
  ),
});
export type TemplateView = z.infer<typeof templateViewSchema>;
export const knowledgeSearchSchema = z.strictObject({
  q: z.string().max(500).default(""),
  kind: z.enum(["all", "question", "plan", "adr", "assumption"]).default("all"),
  action: z
    .string()
    .regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/)
    .optional(),
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type KnowledgeSearch = z.input<typeof knowledgeSearchSchema>;
export const knowledgeEntrySchema = z.strictObject({
  id: z.string(),
  kind: z.enum(["question", "profile", "plan", "adr"]),
  assumed: z.boolean(),
  title: z.string(),
  text: z.string(),
  path: z.string(),
  anchor: z.string().nullable(),
  action: z.string().nullable(),
  at: z.string().nullable(),
  by: z.string().nullable(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["recorded", "pending", "stale"]),
});
export const knowledgeDataSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ai-context"), context: aiContextSchema }),
  z.strictObject({
    kind: z.literal("decisions"),
    items: z.array(knowledgeEntrySchema),
    total: z.number().int().nonnegative(),
    problems: z.array(
      z.strictObject({ path: z.string(), message: z.string() }),
    ),
  }),
  z.strictObject({
    kind: z.literal("document"),
    document: z.strictObject({
      path: z.string(),
      title: z.string(),
      body: z.string(),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
]);
export type KnowledgeData = z.infer<typeof knowledgeDataSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export const knowledgeRequestSchema = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("ai-context"), intent: aiIntentSchema }),
  knowledgeSearchSchema.extend({ command: z.literal("search-decisions") }),
  z.strictObject({
    command: z.literal("read-document"),
    path: z.string().min(1).max(4096),
  }),
]);
export type KnowledgeRequest = z.infer<typeof knowledgeRequestSchema>;
export const isKnowledgeRequest = (value: {
  command: string;
}): value is KnowledgeRequest =>
  knowledgeRequestSchema.safeParse(value).success;
const historyEntrySchema = z.strictObject({
  label: z.string().nullable(),
  revision: z.string().nullable(),
  blocked: z.string().nullable(),
  conflicts: z.array(z.string()),
  overwriteRevision: z.string().nullable(),
});
export const gitHistorySchema = z.strictObject({
  commits: z.array(
    z.strictObject({
      hash: z.string().regex(/^[a-f0-9]{40,64}$/),
      subject: z.string(),
      author: z.string(),
      at: z.string(),
      actions: z.array(z.string()),
      url: z.string().nullable(),
    }),
  ),
  repository: z.string().nullable(),
  notice: z.string().nullable(),
});
export const workspaceSchema = z.strictObject({
  taskTracking: z.boolean().default(false),
  taskMigration: z
    .strictObject({
      enabled: z.boolean(),
      revision: z.string(),
      path: z.string(),
      version: z.string(),
      paths: z.array(z.string()),
      tasks: z.array(
        z.strictObject({
          id: z.string(),
          title: z.string(),
          targetRelease: z.string().nullable(),
        }),
      ),
    })
    .nullable()
    .default(null),
  metadataRevision: z.string().nullable().default(null),
  projectRelease: z
    .strictObject({
      path: z.string(),
      version: z.string().nullable(),
      revision: z.string().nullable(),
      message: z.string().nullable(),
    })
    .default({
      path: "package.json",
      version: null,
      revision: null,
      message: "Choose the project's package.json",
    }),
  tasks: z
    .array(
      z.strictObject({
        id: z.string(),
        kind: z.enum(["action", "idea"]),
        title: z.string(),
        body: z.string(),
        path: z.string(),
        revision: z.string(),
        column: z.enum(["backlog", "todo", "in-progress", "review", "done"]),
        archived: z.boolean(),
        stage: z.string().nullable(),
        status: z.string(),
        type: z.string().nullable(),
        assignee: z.string().nullable(),
        parent: z.string().nullable(),
        blockedBy: z.array(z.string()),
        sourceIdea: z.string().nullable(),
        targetRelease: z.string().nullable(),
        releaseAssigned: z.boolean(),
      }),
    )
    .default([]),
  format: z.number().int().nullable().default(null),
  editing: z.strictObject({
    undo: historyEntrySchema,
    redo: historyEntrySchema,
    notice: z.string().nullable(),
  }),
  name: z.string(),
  hasVoidra: z.boolean(),
  readOnly: z.boolean(),
  hasCode: z.boolean(),
  codeEvidence: z.array(z.string()),
  templates: z.array(templateViewSchema),
  templateProblems: z.array(z.string()),
  template: z.object({ id: z.string(), version: z.string() }).nullable(),
  identity: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    value: z.string().nullable(),
    notice: z.string().nullable(),
  }),
  profiles: z.array(
    z.strictObject({
      path: z.string(),
      revision: z.string(),
      body: z.string(),
      data: z.looseObject({
        block: z.string(),
        title: z.string(),
        answers: z.array(
          z.looseObject({
            id: z.string(),
            question: z.string(),
            answer: z.json(),
            status: z.enum(["confirmed", "inferred", "assumed", "open"]),
            source: z.string().optional(),
            confirmedBy: z.string().optional(),
            updatedAt: z.string().optional(),
          }),
        ),
      }),
    }),
  ),
  ideas: z.array(
    z.strictObject({
      path: z.string(),
      revision: z.string(),
      body: z.string(),
      data: z.looseObject({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        type: actionTypeSchema.optional(),
        assignee: z.string().optional(),
        targetRelease: z.string().nullable().optional(),
        reason: z.string().optional(),
        promotedTo: z.string().optional(),
      }),
    }),
  ),
  releases: z
    .array(
      z.strictObject({
        path: z.string(),
        body: z.string(),
        data: z.looseObject({
          version: z.string(),
          action: z.string().optional(),
          supersededByVersion: z.string().optional(),
          actions: z.array(z.string()),
          status: z.enum(["draft", "released"]),
          tag: z.string().optional(),
          date: z.string().optional(),
        }),
      }),
    )
    .default([]),
  releaseCandidates: z
    .array(
      z.strictObject({
        id: z.string(),
        title: z.string(),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .default([]),
  actions: z.array(
    z.strictObject({
      data: z.looseObject({
        id: z.string(),
        title: z.string(),
        type: z.string(),
        stage: z.string().optional(),
        status: z.string(),
        doneBy: z.string(),
        targetRelease: z.string().nullable().optional(),
        taskColumn: z.enum(["backlog", "todo"]).optional(),
        assignee: z.string().optional(),
        parent: z.string().optional(),
        blockedBy: z.array(z.string()).optional(),
        links: z.array(z.string()).optional(),
        completedBySlices: z.boolean().optional(),
        steps: z
          .array(
            z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
          )
          .optional(),
        commits: z.array(z.string()).optional(),
        releaseActions: z.array(z.string()).optional(),
        releaseVersion: z.string().optional(),
        releaseTag: z.string().optional(),
        releasedIn: z.string().optional(),
        planFeedback: z
          .looseObject({ feedback: z.string(), by: z.string(), at: z.string() })
          .optional(),
        reviewDecision: z
          .looseObject({
            decision: z.string(),
            feedback: z.string().optional(),
          })
          .optional(),
      }),
      body: z.string(),
      path: z.string(),
      revision: z.string(),
      editRevision: z.string(),
      timeline: z.array(z.string()),
      planRevision: z.string().nullable().default(null),
      changedPlans: z.array(z.string()).default([]),
      effectiveStage: z.string().optional(),
      questions: z
        .object({
          path: z.string(),
          revision: z.string(),
          rounds: z.array(
            z.object({
              round: z.number(),
              askedAt: z.string(),
              questions: z.array(questionViewSchema),
            }),
          ),
        })
        .nullable()
        .default(null),

      blocked: z.boolean(),
      queueable: z.boolean().default(false),
      queueReason: z.string().nullable().default(null),
      plans: z
        .array(
          z.object({ name: z.string(), path: z.string(), body: z.string() }),
        )
        .default([]),
      runs: z.array(
        z.strictObject({
          data: z.looseObject({
            id: z.string(),
            action: z.string(),
            agent: z.string(),
            outcome: z.string(),
            commit: z.string().optional(),
            endedAt: z.string().optional(),
            toStage: z.string().optional(),
            checks: z
              .array(z.object({ name: z.string(), passed: z.boolean() }))
              .optional(),
          }),
          body: z.string(),
          path: z.string(),
        }),
      ),
    }),
  ),
  planning: z
    .strictObject({
      enabled: z.boolean(),
      reason: z.string().nullable(),
      revision: z.string(),
      head: z.string().nullable(),
      indexHash: z.string().nullable(),
      files: z.array(
        z.strictObject({
          path: z.string(),
          status: z.enum(["new", "modified", "deleted"]),
          hash: z.string().nullable(),
          mode: z.number().nullable(),
        }),
      ),
      pending: z.array(
        z.strictObject({
          id: z.string().uuid(),
          commit: z.string().nullable(),
          recoverable: z.boolean(),
          message: z.string(),
        }),
      ),
    })
    .default({
      enabled: false,
      reason: "Open a project",
      revision: "",
      head: null,
      indexHash: null,
      files: [],
      pending: [],
    }),
  history: gitHistorySchema.default({
    commits: [],
    repository: null,
    notice: null,
  }),
  sync: z
    .strictObject({
      examinedRevision: z.string().nullable(),
      since: z.string().nullable(),
      count: z.number().int().nonnegative(),
    })
    .default({ examinedRevision: null, since: null, count: 0 }),
  queue: z.array(z.string()),
  queueRevision: z.string().nullable().default(null),
  recoveries: z.array(
    z.strictObject({
      kind: z.enum(["run", "operation"]),
      id: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
    }),
  ),
  lock: z.strictObject({
    state: z.enum(["none", "running", "stale", "interrupted", "invalid"]),
    recoverable: z.boolean(),
    message: z.string(),
    action: z.string().optional(),
    run: z.string().optional(),
  }),
  diagnostics: z.array(
    z.strictObject({
      code: z.string(),
      file: z.string(),
      field: z.string(),
      line: z.number(),
      message: z.string(),
    }),
  ),
});
export type WorkspaceSnapshot = z.infer<typeof workspaceSchema>;
export const themeSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themeSchema>;
export const recentSchema = z.looseObject({
  path: z.string().min(1),
  name: z.string().min(1),
  lastOpened: z.iso.datetime(),
});
export const recentViewSchema = recentSchema.extend({ missing: z.boolean() });
export const projectSchema = z.strictObject({
  path: z.string(),
  name: z.string(),
  hasVoidra: z.boolean(),
  sqliteVersion: z.string(),
});
export const serviceStateSchema = z.enum([
  "starting",
  "ready",
  "restarting",
  "failed",
]);
export const workspaceRequestSchema = z.discriminatedUnion("command", [
  z.strictObject({
    command: z.literal("move-task"),
    id: z.string().regex(/^(act|idea)-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    column: z.enum(["backlog", "todo", "in-progress", "review", "done"]),
    type: actionTypeSchema.optional(),
  }),
  z.strictObject({
    command: z.literal("enable-task-tracking"),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    command: z.literal("set-release-package"),
    path: z.string().min(1).max(4096),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    command: z.literal("create-release"),
    actions: z
      .array(
        z.strictObject({
          id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
          revision: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    command: z.literal("revisit-assumption"),
    id: z.string().min(1).max(1024),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    command: z.literal("undo"),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    overwriteRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({
    command: z.literal("redo"),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    overwriteRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({
    command: z.literal("commit-planning"),
    id: z.string().uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    paths: z.array(z.string()).min(1),
    message: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({
    command: z.literal("recover-planning"),
    id: z.string().uuid(),
  }),
  z.strictObject({
    command: z.literal("discard-planning"),
    id: z.string().uuid(),
  }),

  z.strictObject({ command: z.literal("workspace") }),
  z.strictObject({
    command: z.literal("answer-question"),
    id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
    question: z.string().regex(/^q-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    answer: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("choice"), choice: z.string().min(1) }),
      z.strictObject({
        kind: z.literal("text"),
        text: z
          .string()
          .min(1)
          .max(20000)
          .refine((value) => !!value.trim()),
      }),
      z.strictObject({ kind: z.literal("agent-decides") }),
    ]),
  }),
  z.strictObject({
    command: z.literal("approve-plan"),
    id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    command: z.literal("reject-plan"),
    id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    feedback: z
      .string()
      .min(1)
      .max(20000)
      .refine((value) => !!value.trim()),
  }),

  z.strictObject({ command: z.literal("create-voidra") }),
  z.strictObject({
    command: z.literal("edit-action"),
    targetRelease: z.string().min(1).max(80).nullable().optional(),
    id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().min(1).max(20000).optional(),
    assignee: z.string().min(1).nullable().optional(),
    parent: z
      .string()
      .regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/)
      .nullable()
      .optional(),
    blockedBy: z
      .array(z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/))
      .optional(),
    cancel: z.boolean().optional(),
  }),
  z.strictObject({
    command: z.literal("set-human-step"),
    id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    step: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    done: z.boolean(),
  }),
  z.strictObject({
    command: z.literal("promote-idea"),
    assignee: z.string().min(1).nullable().optional(),
    id: z.string().regex(/^idea-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    type: actionTypeSchema,
    title: z.string().trim().min(1).max(160),
    description: z.string().min(1).max(20000),
  }),
  z.strictObject({
    command: z.literal("create-idea"),
    type: actionTypeSchema.optional(),
    assignee: z.string().min(1).nullable().optional(),
    submission: z.uuid().optional(),
    targetRelease: z.string().min(1).max(80).nullable().optional(),
    title: z.string().trim().min(1).max(160),
    description: z.string().min(1).max(20000),
    status: z.enum(["new", "needs-info", "ready", "rejected"]).optional(),
    reason: z.string().max(20000).optional(),
  }),
  z.strictObject({
    command: z.literal("edit-idea"),
    type: actionTypeSchema.optional(),
    assignee: z.string().min(1).nullable().optional(),
    targetRelease: z.string().min(1).max(80).nullable().optional(),
    id: z.string().regex(/^idea-[0-9a-hjkmnp-tv-z]{6}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().trim().min(1).max(160),
    description: z.string().min(1).max(20000),
    status: z.enum(["new", "needs-info", "ready", "promoted", "rejected"]),
    reason: z.string().max(20000).optional(),
  }),
  z.strictObject({
    command: z.literal("initialize-profile"),
    template: z.string().min(1),
    name: z.string().trim().min(1).max(160),
    answers: z.record(z.string(), z.json()),
  }),
  z.strictObject({
    command: z.literal("edit-profile-answer"),
    block: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    value: z.json(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    command: z.literal("replace-queue"),
    ids: z.array(z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/)),
    revision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    revisions: z.record(
      z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
      z.string().regex(/^[a-f0-9]{64}$/),
    ),
  }),
  z.strictObject({
    command: z.literal("queue-action"),
    id: z.string().min(1),
    revision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({
    command: z.literal("review-action"),
    id: z.string().min(1),
    decision: z.enum(["accepted", "rejected"]),
    revision: z.string().min(1),
    feedback: z.string().max(20000),
  }),
  z.strictObject({
    command: z.literal("create-action"),
    submission: z.uuid().optional(),
    targetRelease: z.string().min(1).max(80).nullable().optional(),
    taskColumn: z.enum(["backlog", "todo"]).optional(),
    title: z.string().trim().min(1).max(160),
    description: z.string().min(1).max(20000),
    type: actionTypeSchema.optional(),
    doneBy: z.enum(["agent", "you"]).optional(),
    assignee: z.string().min(1).optional(),
    steps: z.array(z.string().trim().min(1)).optional(),
  }),
]);
export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>;
/** Exhaustive classification: a new project command must declare its edit label. */
export const workspaceEdits = {
  "move-task": "Move task",
  "enable-task-tracking": "Enable task tracking",
  "set-release-package": "Select release package",
  "create-release": "Create release",
  "revisit-assumption": "Revisit assumption",
  workspace: null,
  "commit-planning": null,
  "recover-planning": null,
  "discard-planning": null,
  undo: null,
  redo: null,
  "answer-question": "Answer question",
  "approve-plan": "Approve plan",
  "reject-plan": "Request plan changes",
  "create-voidra": "Create planning folder",
  "edit-action": "Edit action",
  "set-human-step": "Change checklist",
  "promote-idea": "Promote idea",
  "create-idea": "Create idea",
  "edit-idea": "Edit idea",
  "initialize-profile": "Create project profile",
  "edit-profile-answer": "Edit profile answer",
  "replace-queue": "Change run queue",
  "queue-action": "Queue action",
  "review-action": "Review action",
  "create-action": "Create action",
} satisfies Record<WorkspaceRequest["command"], string | null>;
export const requestSchema = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("draft-ready") }),
  z.strictObject({
    command: z.literal("draft-flushed"),
    id: z.uuid(),
    error: z.string().max(2000).nullable(),
  }),
  ...draftRequestSchemas,
  ...updateRequestSchemas,
  ...skillRequestSchemas,
  ...teamRequestSchemas,
  z.strictObject({
    command: z.literal("set-coding-client"),
    client: codingClientSchema,
  }),
  ...aiRequestSchemas,
  ...knowledgeRequestSchema.options,
  z.strictObject({
    command: z.literal("open-document-editor"),
    path: z.string().min(1).max(4096),
  }),
  z.strictObject({
    command: z.literal("text-edit-focus"),
    editing: z.boolean(),
  }),
  z.strictObject({
    command: z.literal("text-edit"),
    direction: z.enum(["undo", "redo"]),
  }),
  ...workspaceRequestSchema.options,
  z.strictObject({
    command: z.literal("open-commit"),
    hash: z.string().regex(/^[a-f0-9]{40,64}$/),
  }),
  z.strictObject({ command: z.literal("snapshot") }),
  z.strictObject({ command: z.literal("choose-folder") }),
  z.strictObject({
    command: z.literal("copy-recovery-command"),
    kind: z.enum(["run", "operation"]),
    id: z.string().regex(/^(?:run|op)-[0-9a-hjkmnp-tv-z]{6}$/),
    agent: z.enum(["claude-code", "codex"]),
  }),
  z.strictObject({
    command: z.literal("copy-agent-command"),
    agent: z.enum(["claude-code", "codex"]),
    skill: z.enum(["voidra-go", "voidra-init", "voidra-sync"]).optional(),
  }),
  z.strictObject({
    command: z.literal("open-recent"),
    path: z.string().min(1),
  }),
  z.strictObject({
    command: z.literal("remove-recent"),
    path: z.string().min(1),
  }),
  z.strictObject({
    command: z.literal("locate-recent"),
    path: z.string().min(1),
  }),
  z.strictObject({ command: z.literal("set-theme"), theme: themeSchema }),
  z.strictObject({
    command: z.literal("set-custom-titlebar"),
    enabled: z.boolean(),
  }),
  z.strictObject({
    command: z.literal("window-control"),
    action: z.enum(["close", "minimize", "toggle-maximize"]),
  }),
  z.strictObject({ command: z.literal("service-status") }),
  z.strictObject({ command: z.literal("service-retry") }),
]);
export type BridgeRequest = z.infer<typeof requestSchema>;
export function isWorkspaceRequest(
  input: BridgeRequest,
): input is WorkspaceRequest {
  return workspaceRequestSchema.safeParse(input).success;
}
export const snapshotSchema = z.strictObject({
  defaultClient: codingClientSchema.default("codex"),
  team: teamViewSchema.default(() => ({
    members: [],
    me: null,
    projectMembers: [],
    revision: "0".repeat(64),
  })),
  appVersion: z.string().default("0.0.0"),
  updatesEnabled: z.boolean().default(true),
  update: updateNoticeSchema.nullable().default(null),
  skillsOffer: z.boolean().default(true),
  kind: z.literal("snapshot"),
  theme: themeSchema,
  customTitlebar: z.boolean().default(true),
  window: z
    .strictObject({
      customTitlebar: z.boolean(),
      maximized: z.boolean(),
      platform: z.string(),
    })
    .nullable()
    .default(null),
  project: projectSchema.nullable(),
  recents: z.array(recentViewSchema),
  serviceState: serviceStateSchema.nullable(),
  ai: z
    .strictObject({ configured: z.boolean(), model: z.string().nullable() })
    .default({ configured: false, model: null }),
});
export const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum([
        "invalid-request",
        "invalid-response",
        "untrusted-sender",
        "not-found",
        "service-unavailable",
        "io",
      ]),
      message: z.string(),
    }),
  }),
  z.strictObject({
    ok: z.literal(true),
    data: z.discriminatedUnion("kind", [
      ...draftReplySchemas,
      ...aiReplySchemas,
      ...skillReplySchemas,
      ...knowledgeDataSchema.options,
      snapshotSchema,
      z.strictObject({
        kind: z.literal("workspace"),
        workspace: workspaceSchema,
      }),
      z.strictObject({
        kind: z.literal("project"),
        project: projectSchema.nullable(),
      }),
      z.strictObject({ kind: z.literal("changed") }),
      z.strictObject({
        kind: z.literal("service"),
        project: projectSchema.nullable(),
      }),
    ]),
  }),
]);
export type BridgeResponse = z.infer<typeof responseSchema>;
export type ProjectInfo = z.infer<typeof projectSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const eventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("draft-flush"), id: z.uuid() }),
  z.strictObject({ type: z.literal("draft-deleted"), id: z.uuid() }),
  z.strictObject({
    type: z.literal("ai-progress"),
    id: z.string().uuid(),
    characters: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("edit-history"),
    direction: z.enum(["undo", "redo"]),
  }),
  z.strictObject({ type: z.literal("changed") }),
  z.strictObject({ type: z.literal("settings") }),
  z.strictObject({ type: z.literal("service"), state: serviceStateSchema }),
]);
export type BridgeEvent = z.infer<typeof eventSchema>;
export interface DesktopBridge {
  invoke: (request: BridgeRequest) => Promise<BridgeResponse>;
  subscribe: (callback: (event: BridgeEvent) => void) => () => void;
  sandboxed: boolean;
}
