import { z } from "zod";
export const skillAgentSchema = z.enum(["claude", "codex"]);
export const skillNameSchema = z
  .string()
  .regex(/^voidra-[a-z]+(?:-[a-z]+)*$/)
  .max(64);
export const skillOperationSchema = z.enum(["install", "remove"]);
export const skillStatusSchema = z.strictObject({
  agent: skillAgentSchema,
  name: skillNameSchema,
  installedVersion: z.string().nullable(),
  bundledVersion: z.string(),
  installedFormat: z.number().int().nullable(),
  bundledFormat: z.number().int(),
  present: z.boolean(),
  edited: z.boolean(),
  blocked: z.string().nullable(),
  compatibility: z.string().nullable(),
  revision: z.string().nullable(),
});
export type SkillStatus = z.infer<typeof skillStatusSchema>;
export const skillPreviewSchema = z.strictObject({
  agent: skillAgentSchema,
  name: skillNameSchema,
  operation: skillOperationSchema,
  revision: z.string(),
  bundleRevision: z.string(),
  requiresConfirmation: z.boolean(),
  diff: z.string(),
});
export type SkillPreview = z.infer<typeof skillPreviewSchema>;
export const skillRequestSchemas = [
  z.strictObject({ command: z.literal("skills-status") }),
  z.strictObject({ command: z.literal("skills-dismiss-offer") }),
  z.strictObject({
    command: z.literal("skills-preview"),
    agent: skillAgentSchema,
    name: skillNameSchema,
    operation: skillOperationSchema,
  }),
  z.strictObject({
    command: z.literal("skills-apply"),
    agent: skillAgentSchema,
    name: skillNameSchema,
    operation: skillOperationSchema,
    revision: z.string(),
    bundleRevision: z.string(),
    confirmed: z.boolean(),
  }),
] as const;
export const skillReplySchemas = [
  z.strictObject({
    kind: z.literal("skills-status"),
    skills: z.array(skillStatusSchema),
  }),
  z.strictObject({
    kind: z.literal("skills-preview"),
    preview: skillPreviewSchema,
  }),
] as const;
