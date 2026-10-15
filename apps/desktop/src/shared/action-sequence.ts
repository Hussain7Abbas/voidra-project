import { z } from "zod";

const id = z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
  revision = z.string().regex(/^[a-f0-9]{64}$/);
export const actionSequencePreviewSchema = z.strictObject({
  enabled: z.boolean(),
  revision,
  order: z.array(id),
  pending: z.array(id),
});
export const actionSequenceViewSchema = z.strictObject({
  enabled: z.boolean(),
  revision: revision.nullable(),
  order: z.array(id),
  pending: z.array(id),
  warnings: z.array(
    z.strictObject({
      task: id,
      dependency: id,
      kind: z.enum(["later", "absent", "missing"]),
      path: z.array(id),
    }),
  ),
  problems: z.array(z.string()),
  rearranged: z.array(id).nullable(),
  preview: actionSequencePreviewSchema.nullable(),
});
export const emptyActionSequence = {
  enabled: false,
  revision: null,
  order: [],
  pending: [],
  warnings: [],
  problems: [],
  rearranged: null,
  preview: null,
} satisfies z.infer<typeof actionSequenceViewSchema>;
export const actionSequenceRequestSchemas = [
  z.strictObject({ command: z.literal("enable-action-sequence"), revision }),
  z.strictObject({
    command: z.literal("replace-action-sequence"),
    revision,
    queueRevision: revision.nullable(),
    order: z
      .array(id)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate sequence entry",
      ),
    revisions: z.record(id, revision),
  }),
] as const;
