import { z } from "zod";
import { isReleaseVersion } from "../../../../tools/release-engine/src/version.ts";
export const stableVersionSchema = z
  .string()
  .refine(isReleaseVersion, "Use a canonical stable X.Y.Z release version");
export const updateNoticeSchema = z.strictObject({
  version: stableVersionSchema,
  title: z.string().max(200),
  notes: z.string().max(20000),
  url: z.url(),
});
export type UpdateNotice = z.infer<typeof updateNoticeSchema>;
export const updateRequestSchemas = [
  z.strictObject({ command: z.literal("set-updates"), enabled: z.boolean() }),
  z.strictObject({
    command: z.literal("open-update"),
    version: stableVersionSchema,
  }),
] as const;
