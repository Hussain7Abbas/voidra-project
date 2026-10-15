import { z } from "zod";

const text = z.string().max(20000),
  slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  action = z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/);
export const aiIntentSchema = z.discriminatedUnion("feature", [
  z.strictObject({
    feature: z.literal("task-title"),
    notes: text,
    target: z.enum(["idea", "action"]),
  }),
  z.strictObject({
    feature: z.literal("task-capture"),
    notes: text,
    target: z.enum(["idea", "action"]),
  }),
  z.strictObject({
    feature: z.literal("rewrite"),
    notes: text,
    target: z.enum(["idea", "action"]),
  }),
  z.strictObject({
    feature: z.literal("profile"),
    notes: text,
    template: slug,
    templateVersion: z.string().min(1),
    block: slug,
    answer: slug,
  }),
  z.strictObject({
    feature: z.literal("followup"),
    notes: text,
    template: slug,
    templateVersion: z.string().min(1),
    block: slug,
    answer: slug,
  }),
  z.strictObject({
    feature: z.literal("summary"),
    notes: text,
    action,
    run: z
      .string()
      .regex(/^run-[0-9a-hjkmnp-tv-z]{6}$/)
      .optional(),
  }),
  z.strictObject({ feature: z.literal("release-notes"), notes: text, action }),
]);
export type AiIntent = z.infer<typeof aiIntentSchema>;
export const aiQuestionSchema = z.strictObject({
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
  options: z
    .array(z.strictObject({ value: z.string(), label: z.string() }))
    .optional(),
});
const sourcePath = z
  .string()
  .regex(
    /^(?:form:profile-question|\.voidra\/(?:profile\/[a-z0-9-]+\.md|releases\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.md|actions\/act-[0-9a-hjkmnp-tv-z]{6}\/(?:action|requirements|blueprint|acceptance)\.md|actions\/act-[0-9a-hjkmnp-tv-z]{6}\/runs\/[^/]+\.md))$/,
  );
export const aiContextSchema = z.strictObject({
  feature: z.enum([
    "task-title",
    "task-capture",
    "rewrite",
    "profile",
    "followup",
    "summary",
    "release-notes",
  ]),
  notes: text,
  target: z.enum(["idea", "action"]).optional(),
  question: aiQuestionSchema.optional(),
  sources: z
    .array(
      z.strictObject({
        path: sourcePath,
        label: z.string().min(1),
        text: z.string().max(32000),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(100),
});
export type AiContext = z.infer<typeof aiContextSchema>;
export const aiSuggestionSchema = z.discriminatedUnion("feature", [
  z.strictObject({
    feature: z.literal("task-title"),
    title: z.string().trim().min(1).max(160),
  }),
  z.strictObject({
    feature: z.literal("task-capture"),
    title: z.string().trim().min(1).max(160),
    description: z.string().min(1).max(20000),
    type: z.enum([
      "feature",
      "bug",
      "improvement",
      "docs",
      "profile-change",
      "research",
      "release",
    ]),
  }),
  z.strictObject({
    feature: z.literal("rewrite"),
    title: z.string().trim().min(1).max(2000),
    description: z.string().trim().min(1).max(20000),
  }),
  z.strictObject({ feature: z.literal("profile"), value: z.json() }),
  z.strictObject({
    feature: z.literal("followup"),
    questions: z.array(z.string().trim().min(1).max(2000)).min(1).max(6),
  }),
  ...(["summary", "release-notes"] as const).map((feature) =>
    z.strictObject({
      feature: z.literal(feature),
      text: z.string().trim().min(1).max(20000),
    }),
  ),
]);
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
export const aiPreferencesSchema = z.strictObject({
  configured: z.boolean(),
  available: z.boolean(),
  model: z.string().nullable(),
});
export const aiModelSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().nullable(),
  promptPrice: z.string().nullable(),
  completionPrice: z.string().nullable(),
});
export const aiRequestSchemas = [
  z.strictObject({ command: z.literal("ai-settings") }),
  z.strictObject({
    command: z.literal("ai-set-key"),
    key: z.string().trim().min(1).max(4096),
  }),
  z.strictObject({ command: z.literal("ai-remove-key") }),
  z.strictObject({
    command: z.literal("ai-set-model"),
    model: z.string().min(1).max(200),
  }),
  z.strictObject({ command: z.literal("ai-models") }),
  z.strictObject({ command: z.literal("ai-test") }),
  z.strictObject({ command: z.literal("ai-preview"), intent: aiIntentSchema }),
  z.strictObject({
    command: z.literal("ai-generate"),
    id: z.string().uuid(),
    intent: aiIntentSchema,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ command: z.literal("ai-cancel"), id: z.string().uuid() }),
  z.strictObject({
    command: z.literal("copy-ai-text"),
    text: z.string().max(20000),
  }),
] as const;
export const aiReplySchemas = [
  z.strictObject({
    kind: z.literal("ai-settings"),
    preferences: aiPreferencesSchema,
  }),
  z.strictObject({
    kind: z.literal("ai-models"),
    models: z.array(aiModelSchema),
  }),
  z.strictObject({
    kind: z.literal("ai-connected"),
    connected: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal("ai-preview"),
    version: z.number().int(),
    revision: z.string(),
    model: z.string(),
    text: z.string(),
  }),
  z.strictObject({
    kind: z.literal("ai-suggestion"),
    suggestion: aiSuggestionSchema,
  }),
] as const;
