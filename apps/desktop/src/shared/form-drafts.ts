import { z } from "zod";

export const draftFamilySchema = z.enum([
  "task-create",
  "task-edit",
  "idea-edit",
  "idea-promote",
  "team-member",
  "profile-setup",
  "profile-answer",
  "release-source",
  "ai-review",
  "profile-followup",
  "planning-commit",
  "question-answer",
  "plan-feedback",
  "review-feedback",
  "release-prepare",
]);
export const draftRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const draftInputSchema = z.strictObject({
  id: z.uuid(),
  family: draftFamilySchema,
  target: z.string().max(1000),
  values: z.record(z.string(), z.json()),
  revision: draftRevisionSchema.nullable(),
});
export const draftViewSchema = draftInputSchema
  .omit({ revision: true })
  .extend({
    label: z.string().max(100),
    createdAt: z.string(),
    updatedAt: z.string(),
    revision: draftRevisionSchema,
  });
export type DraftInput = z.infer<typeof draftInputSchema>;
export type DraftView = z.infer<typeof draftViewSchema>;
export const secretDraftViewSchema = z.strictObject({
  id: z.uuid(),
  revision: draftRevisionSchema,
  label: z.literal("Unfinished OpenRouter key"),
  hasValue: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const draftRequestSchemas = [
  z.strictObject({
    command: z.literal("draft-list"),
    family: draftFamilySchema.optional(),
    target: z.string().max(1000).optional(),
  }),
  z.strictObject({ command: z.literal("draft-read"), id: z.uuid() }),
  z.strictObject({ command: z.literal("draft-put"), draft: draftInputSchema }),
  z.strictObject({
    command: z.literal("draft-delete"),
    id: z.uuid(),
    revision: draftRevisionSchema,
  }),
  z.strictObject({
    command: z.literal("copy-draft"),
    id: z.uuid(),
    revision: draftRevisionSchema,
  }),
  z.strictObject({ command: z.literal("secret-draft-list") }),
  z.strictObject({
    command: z.literal("secret-draft-put"),
    id: z.uuid(),
    revision: draftRevisionSchema.nullable(),
    value: z.string().max(4096),
  }),
  z.strictObject({
    command: z.literal("secret-draft-delete"),
    id: z.uuid(),
    revision: draftRevisionSchema,
  }),
  z.strictObject({
    command: z.literal("secret-draft-apply"),
    id: z.uuid(),
    revision: draftRevisionSchema,
  }),
] as const;
const problem = z.strictObject({ id: z.string(), message: z.string() });
export const draftReplySchemas = [
  z.strictObject({
    kind: z.literal("drafts"),
    drafts: z.array(draftViewSchema),
    problems: z.array(problem),
  }),
  z.strictObject({ kind: z.literal("draft"), draft: draftViewSchema }),
  z.strictObject({
    kind: z.literal("secret-drafts"),
    drafts: z.array(secretDraftViewSchema),
    problems: z.array(problem),
  }),
  z.strictObject({
    kind: z.literal("secret-draft"),
    draft: secretDraftViewSchema,
  }),
] as const;

const textFields = [
  "title",
  "prompt",
  "description",
  "body",
  "feedback",
  "value",
  "text",
  "notes",
  "questions",
  "message",
  "name",
  "email",
  "path",
  "projectName",
];
export function draftRecoveryText(values: DraftView["values"]): string {
  const result: string[] = [];
  for (const field of textFields) {
    const value = values[field];
    if (typeof value === "string" && value.trim()) result.push(value);
    else if (Array.isArray(value))
      for (const item of value) if (typeof item === "string") result.push(item);
  }
  const append = (value: DraftView["values"][string]): void => {
    if (typeof value === "string" && value.trim()) result.push(value);
    else if (Array.isArray(value)) for (const item of value) append(item);
    else if (value && typeof value === "object")
      for (const item of Object.values(value)) append(item);
  };
  for (const field of ["answers", "generated"])
    if (values[field] !== undefined) append(values[field]);
  if (typeof values.choice === "string" && values.choice)
    result.push(
      values.choice === "delegate"
        ? "Let the agent decide"
        : values.choice.replace(/^choice:/, "Selected option: "),
    );
  if (Array.isArray(values.selected) && values.selected.length)
    result.push(
      `Selected tasks: ${values.selected.filter((id) => typeof id === "string").join(", ")}`,
    );
  return [...new Set(result)].join("\n\n");
}
