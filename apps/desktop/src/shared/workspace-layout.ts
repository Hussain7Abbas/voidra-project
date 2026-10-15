import { z } from "zod";

export const panelSchema = z.enum(["navigation", "actions", "waiting"]);
export type WorkspacePanel = z.infer<typeof panelSchema>;
export const workspaceLayoutSchema = z.strictObject({
  navigationOpen: z.boolean().default(true),
  actionsOpen: z.boolean().default(true),
  waitingOpen: z.boolean().default(false),
  documentationOpen: z.boolean().default(true),
  documentationWidth: z.number().int().min(180).max(600).default(240),
  navigationWidth: z.number().int().min(180).max(800).default(256),
  actionsWidth: z.number().int().min(240).max(800).default(320),
  waitingHeight: z.number().int().min(160).max(2000).default(280),
  seen: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .max(4096)
    .default([]),
});
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;
export const workspaceLayoutPatchSchema = z.strictObject({
  navigationOpen: z.boolean().optional(),
  actionsOpen: z.boolean().optional(),
  waitingOpen: z.boolean().optional(),
  documentationOpen: z.boolean().optional(),
  documentationWidth: z.number().int().min(180).max(600).optional(),
  navigationWidth: z.number().int().min(180).max(800).optional(),
  actionsWidth: z.number().int().min(240).max(800).optional(),
  waitingHeight: z.number().int().min(160).max(2000).optional(),
  seen: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .max(4096)
    .optional(),
});
export const workspaceLayoutViewSchema = z.strictObject({
  context: z.string().regex(/^[a-f0-9]{64}$/),
  value: workspaceLayoutSchema,
});
export const workspaceLayoutRequestSchema = z.strictObject({
  command: z.literal("set-workspace-layout"),
  context: workspaceLayoutViewSchema.shape.context,
  patch: workspaceLayoutPatchSchema,
});
export type WorkspaceLayoutView = z.infer<typeof workspaceLayoutViewSchema>;
/** Displayed sizes adapt to the window; saved preferred dimensions stay intact. */
export function fitWorkspaceLayout(
  value: WorkspaceLayout,
  width: number,
  height: number,
): WorkspaceLayout {
  let left = value.navigationOpen ? value.navigationWidth : 0,
    right = value.actionsOpen ? value.actionsWidth : 0;
  const separators =
      (value.navigationOpen ? 6 : 0) + (value.actionsOpen ? 6 : 0),
    minimumLeft = value.navigationOpen ? 180 : 0,
    minimumRight = value.actionsOpen ? 240 : 0,
    main = Math.min(
      320,
      Math.max(160, width - separators - minimumLeft - minimumRight),
    ),
    budget = Math.max(minimumLeft + minimumRight, width - separators - main);
  let excess = Math.max(0, left + right - budget);
  const reduceLeft = Math.min(left - minimumLeft, Math.ceil(excess / 2));
  left -= reduceLeft;
  excess -= reduceLeft;
  const reduceRight = Math.min(right - minimumRight, excess);
  right -= reduceRight;
  excess -= reduceRight;
  left -= Math.min(left - minimumLeft, excess);
  return {
    ...value,
    navigationWidth: left,
    actionsWidth: right,
    waitingHeight: Math.max(160, Math.min(value.waitingHeight, height - 166)),
  };
}
