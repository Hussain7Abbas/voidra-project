import { z } from "zod";
import {
  releasePackageSchema,
  releasePreparationSchema,
} from "./release-preparation-schema.ts";

export type { ReleasePreparation } from "./release-preparation-schema.ts";
export {
  releasePackageSchema,
  releasePreparationSchema,
  stableReleaseVersionSchema,
} from "./release-preparation-schema.ts";

import type { Diagnostic } from "./errors.ts";
import { fieldLine, type RecordDocument } from "./records.ts";

export const plainSchemas = {
  guide: z.string().min(1),
  ignore: z.string().regex(/^(?:\/)?local\/\s*$/m),
};
const object = z.looseObject;
const text = z.string().min(1);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}-[0-9a-hjkmnp-tv-z]{6}$`));
const date = z.iso.datetime({ offset: true });
export const version = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const types = [
  "feature",
  "bug",
  "improvement",
  "docs",
  "profile-change",
  "research",
  "release",
] as const;
export const stages = [
  "discovery",
  "plan",
  "implement",
  "verify",
  "review",
  "done",
  "released",
  "cancelled",
] as const;
export const lifecycleOverridesSchema = z.partialRecord(
  z.enum(types),
  object({
    stages: z.array(z.enum(stages)),
    planGate: z.boolean(),
    rejectTo: z.enum(stages),
  }),
);
export const hashesSchema = object({
  "requirements.md": hashSchema,
  "blueprint.md": hashSchema,
  "acceptance.md": hashSchema,
});
export const approvalSchema = object({
  by: text,
  at: date,
  hashes: hashesSchema,
});
const answerSchema = z.discriminatedUnion("kind", [
  object({ kind: z.literal("choice"), choice: text, by: text, at: date }),
  object({ kind: z.literal("text"), text: text, by: text, at: date }),
  object({ kind: z.literal("agent-decides"), by: text, at: date }),
]);
export const questionSchema = object({
  id: id("q"),
  text,
  why: text,
  options: z.array(
    object({ label: text, description: text, recommended: z.boolean() }),
  ),
  allowFreeText: z.boolean(),
  dependsOn: z.array(id("q")).optional(),
  answer: answerSchema.optional(),
  agentChoice: object({
    choice: text,
    reason: text,
    by: text,
    at: date,
  }).optional(),
});
export const actionSchema = object({
  id: id("act"),
  type: z.enum(types),
  title: text,
  stage: z.enum(stages).optional(),
  status: z.enum([
    "draft",
    "ready",
    "running",
    "waiting",
    "failed",
    "complete",
  ]),
  doneBy: z.enum(["agent", "you"]),
  assignee: text.optional(),
  targetRelease: version.nullable().optional(),
  taskColumn: z.enum(["backlog", "todo"]).optional(),
  parent: id("act").optional(),
  blockedBy: z.array(id("act")).optional(),
  links: z.array(text).optional(),
  commits: z.array(text).optional(),
  releaseActions: z.array(id("act")).min(1).optional(),
  releasePreparation: releasePreparationSchema.optional(),
  releaseVersion: version.optional(),
  releaseTag: text.optional(),
  releaseFiles: z.array(text).optional(),
  releaseMessage: text.optional(),
  releasedIn: version.optional(),
  completedBySlices: z.boolean().optional(),
  createdBy: text.optional(),
  createdAt: date.optional(),
  updatedAt: date.optional(),
  profileChange: object({
    block: slug,
    answerId: slug,
    before: z.json(),
    after: z.json(),
  }).optional(),
  planFeedback: object({
    revision: hashSchema,
    feedback: text,
    by: text,
    at: date,
  }).optional(),
  planApproval: approvalSchema.optional(),
  approvalHistory: z.array(approvalSchema).optional(),
  reviewDecision: object({
    revision: hashSchema,
    decision: z.enum(["accepted", "rejected"]),
    feedback: z.string().optional(),
    hashes: approvalSchema.shape.hashes.optional(),
    by: text,
    at: date,
  }).optional(),
  steps: z
    .array(object({ id: slug, title: text, done: z.boolean() }))
    .optional(),
});
export const schemas = {
  project: object({
    format: z.number().int().nonnegative(),
    requiredVoidra: version,
    project: object({ id: id("prj"), name: text }),
    template: object({ id: slug, version }).nullable(),
    createdWith: text,
    releasePackage: releasePackageSchema.optional(),
    taskTracking: z.literal(1).optional(),
    lifecycleOverrides: z.json().optional(),
  }),
  profile: object({
    block: slug,
    title: text,
    answers: z.array(
      object({
        id: slug,
        question: text,
        answer: z.json(),
        status: z.enum(["confirmed", "inferred", "assumed", "open"]),
        source: text.optional(),
        updatedAt: date.optional(),
        confirmedBy: text.optional(),
      }),
    ),
  }),
  idea: object({
    id: id("idea"),
    assignee: text.optional(),
    type: actionSchema.shape.type.optional(),
    title: text,
    targetRelease: version.nullable().optional(),
    status: z.enum(["new", "needs-info", "ready", "promoted", "rejected"]),
    reason: text.optional(),
    promotedTo: id("act").optional(),
    createdBy: text.optional(),
    createdAt: date.optional(),
  }),
  action: actionSchema,
  questions: object({
    action: id("act"),
    rounds: z.array(
      object({
        round: z.number().int().positive(),
        askedAt: date,
        questions: z.array(questionSchema),
      }),
    ),
  }),
  requirements: object({ action: id("act") }),
  blueprint: object({ action: id("act") }),
  acceptance: object({ action: id("act") }),
  run: object({
    id: id("run"),
    action: id("act"),
    agent: z.enum(["claude-code", "codex"]),
    startedAt: date,
    consumedRecords: z.array(text),
    orderedIntent: object({
      version: z.literal(1),
      revision: hashSchema,
      queueRevision: hashSchema,
    }).optional(),
    endedAt: date.optional(),
    fromStage: z.enum(stages),
    toStage: z.enum(stages).optional(),
    outcome: z.enum([
      "running",
      "advanced",
      "waiting",
      "failed",
      "interrupted",
    ]),
    commit: text.optional(),
    checks: z.array(object({ name: text, passed: z.boolean() })).optional(),
    paths: z.array(text).optional(),
    planningOnly: z.boolean().optional(),
    reviews: object({
      standards: object({ passed: z.boolean(), summary: text }),
      plan: object({ passed: z.boolean(), summary: text }),
    }).optional(),
  }),
  release: object({
    version,
    supersededByVersion: version.optional(),
    action: id("act").optional(),
    actions: z.array(id("act")),
    status: z.enum(["draft", "released"]),
    tag: text.optional(),
    date: date.optional(),
  }),
  sync: object({
    id: id("sync"),
    examinedRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
    since: z
      .string()
      .regex(/^[a-f0-9]{40,64}$/)
      .nullable(),
    commits: z.array(z.string().regex(/^[a-f0-9]{40,64}$/)).min(1),
    proposals: z.array(z.union([id("act"), id("idea")])),
    consumedRecords: z.array(text),
    by: text,
    at: date,
  }),
  queue: object({
    queuedBy: text.optional(),
    queuedAt: date.optional(),
    orderedIntent: z.literal(1).optional(),
  }).superRefine((value, ctx) => {
    if (value.orderedIntent !== 1) {
      if (value.queuedBy === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["queuedBy"],
          message: "Legacy queues require queuedBy",
        });
      if (value.queuedAt === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["queuedAt"],
          message: "Legacy queues require queuedAt",
        });
    }
  }),
  lock: object({
    ownerToken: text,
    pid: z.number().int().positive(),
    processStartedAt: text,
    agent: z.enum(["claude-code", "codex"]),
    host: text,
    run: id("run"),
    action: id("act"),
    startedAt: date,
    heartbeatAt: date,
  }),
  operation: object({
    id: id("op"),
    fingerprint: hashSchema,
    state: z.enum(["prepared", "committed", "rolled-back"]),
    changes: z
      .array(
        object({
          path: text,
          expectedHash: hashSchema.nullable(),
          before: z.string().nullable(),
          after: z.string().nullable(),
        }),
      )
      .min(1),
  }),
};
export type RecordKind = keyof typeof schemas;
export type Action = z.infer<typeof actionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Operation = z.infer<typeof schemas.operation>;
export type ProjectMetadata = z.infer<typeof schemas.project>;

export function validateRecord(
  kind: RecordKind,
  record: RecordDocument,
): Diagnostic[] {
  const result = schemas[kind].safeParse(record.data);
  if (!result.success)
    return result.error.issues.map((issue) => ({
      code: "schema",
      file: record.file,
      field: issue.path.map(String).join(".") || "$",
      line: fieldLine(record, issue.path),
      message: issue.message,
    }));
  const errors: Diagnostic[] = [];
  const add = (field: string, message: string): void => {
    errors.push({
      code: "schema",
      file: record.file,
      field,
      line: fieldLine(record, field.split(".")),
      message,
    });
  };
  const d = record.data;
  if (kind === "action") {
    if (d.releasePreparation !== undefined) {
      const prep = releasePreparationSchema.parse(d.releasePreparation);
      if (d.type !== "release")
        add(
          "releasePreparation",
          "Only Release actions have release preparation",
        );
      if (
        new Set(prep.tickets.map((ticket) => ticket.id)).size !==
        prep.tickets.length
      )
        add(
          "releasePreparation.tickets",
          "Release ticket choices must be unique",
        );
      if (
        prep.tickets.some(
          (ticket) =>
            !Array.isArray(d.releaseActions) ||
            !d.releaseActions.includes(ticket.id),
        )
      )
        add(
          "releasePreparation.tickets",
          "Versioned tickets must belong to the selected release work",
        );
      if (d.releaseVersion !== undefined && prep.version !== d.releaseVersion)
        add(
          "releasePreparation.version",
          "Preparation must match the proposed release version",
        );
    }
    if (d.releaseActions !== undefined) {
      if (d.type !== "release")
        add("releaseActions", "Only Release actions select release members");
      const members = d.releaseActions as string[];
      if (new Set(members).size !== members.length)
        add("releaseActions", "Release members must be unique");
    }
    if (d.doneBy === "agent" && !d.stage)
      add("stage", "Agent actions require a stage");
    if (d.doneBy === "you" && d.stage && d.stage !== "cancelled")
      add("stage", "Human actions have no agent stage");
    if (d.doneBy === "you" && !d.steps)
      add("steps", "Human actions require steps");
    if (
      d.doneBy === "agent" &&
      d.status === "complete" &&
      !["done", "released", "cancelled"].includes(String(d.stage))
    )
      add("status", "Complete agent actions require a terminal stage");
    if (
      d.doneBy === "you" &&
      d.status === "complete" &&
      d.stage !== "cancelled" &&
      schemas.action.parse(d).steps?.some((step) => !step.done)
    )
      add("steps", "Complete all human steps before completing the action");
    if (
      ["done", "released", "cancelled"].includes(String(d.stage)) &&
      d.status !== "complete"
    )
      add("status", "Terminal stages require complete status");
  }
  if (kind === "idea" && d.status === "rejected" && !d.reason)
    add("reason", "Rejected ideas require a reason");
  if (kind === "idea" && d.status === "promoted" && !d.promotedTo)
    add("promotedTo", "Promoted ideas require an action");
  if (kind === "run" && (d.outcome === "running") === Boolean(d.endedAt))
    add("endedAt", "Running runs have no end time; final runs require one");
  if (kind === "release" && d.status === "released") {
    if (!d.tag) add("tag", "Released records require a tag");
    if (!d.date) add("date", "Released records require a date");
  }
  const headings =
    kind === "requirements"
      ? ["Goal", "Out of scope"]
      : kind === "blueprint"
        ? ["Approach", "Testing seams", "Proposed ADRs"]
        : [];
  for (const heading of headings)
    if (!new RegExp(`^## ${heading}\\s*$`, "m").test(record.body))
      add("body", `Missing section: ${heading}`);
  if (kind === "acceptance" && !/^\s*(?:[-*+] |\d+[.)] )\S/m.test(record.body))
    add("body", "Acceptance requires checkable list items");
  return errors;
}
