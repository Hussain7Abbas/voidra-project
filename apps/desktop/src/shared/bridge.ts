import { z } from "zod";

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
export const workspaceSchema = z.strictObject({
  name: z.string(),
  hasVoidra: z.boolean(),
  readOnly: z.boolean(),
  hasCode: z.boolean(),
  codeEvidence: z.array(z.string()),
  templates: z.array(templateViewSchema),
  templateProblems: z.array(z.string()),
  template: z.object({ id: z.string(), version: z.string() }).nullable(),
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
  actions: z.array(
    z.strictObject({
      data: z.looseObject({
        id: z.string(),
        title: z.string(),
        type: z.string(),
        stage: z.string().optional(),
        status: z.string(),
        doneBy: z.string(),
        commits: z.array(z.string()).optional(),
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
      runs: z.array(
        z.strictObject({
          data: z.looseObject({
            id: z.string(),
            action: z.string(),
            agent: z.string(),
            outcome: z.string(),
            commit: z.string().optional(),
            endedAt: z.string().optional(),
          }),
          body: z.string(),
          path: z.string(),
        }),
      ),
    }),
  ),
  queue: z.array(z.string()),
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
  z.strictObject({ command: z.literal("workspace") }),
  z.strictObject({ command: z.literal("create-voidra") }),
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
  z.strictObject({ command: z.literal("queue-action"), id: z.string().min(1) }),
  z.strictObject({
    command: z.literal("review-action"),
    id: z.string().min(1),
    decision: z.enum(["accepted", "rejected"]),
    revision: z.string().min(1),
    feedback: z.string().max(20000),
  }),
  z.strictObject({
    command: z.literal("create-action"),
    title: z.string().trim().min(1).max(160),
    description: z.string().min(1).max(20000),
  }),
]);
export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>;
export const requestSchema = z.discriminatedUnion("command", [
  ...workspaceRequestSchema.options,
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
    skill: z.enum(["voidra-go", "voidra-init"]).optional(),
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
  kind: z.literal("snapshot"),
  theme: themeSchema,
  project: projectSchema.nullable(),
  recents: z.array(recentViewSchema),
  serviceState: serviceStateSchema.nullable(),
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
