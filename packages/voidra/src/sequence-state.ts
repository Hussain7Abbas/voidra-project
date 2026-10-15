import { z } from "zod";
export const ACTION_SEQUENCE_PATH = ".voidra/local/action-sequence.json";
export const ACTION_QUEUE_PATH = ".voidra/local/pending-actions.md";
export const actionSequenceSchema = z.looseObject({
  version: z.literal(1),
  order: z
    .array(z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/))
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Duplicate sequence entry",
    ),
});
