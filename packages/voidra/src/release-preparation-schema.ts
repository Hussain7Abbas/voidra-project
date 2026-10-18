import { z } from "zod";
export const releasePackageSchema = z
  .string()
  .max(4096)
  .refine(
    (path) =>
      (path === "package.json" || path.endsWith("/package.json")) &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path
        .split("/")
        .some(
          (part) =>
            !part ||
            [".", "..", ".git", ".voidra", "node_modules"].includes(
              part.toLowerCase(),
            ),
        ),
    "Choose a contained project package.json path",
  );
export const releaseDirectorySchema = z
  .string()
  .max(4096)
  .refine(
    (path) =>
      path === "." ||
      releasePackageSchema.safeParse(`${path}/package.json`).success,
    "Choose a contained project folder",
  );

export const stableReleaseVersionSchema = z
  .string()
  .max(64)
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .refine(
    (value) =>
      value.split(".").every((part) => Number.isSafeInteger(Number(part))),
    "Release components must be safe integers",
  );
export const releasePreparationSchema = z.looseObject({
  source: z.looseObject({
    path: releasePackageSchema,
    version: stableReleaseVersionSchema,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  version: stableReleaseVersionSchema,
  bump: z.enum(["patch", "minor", "major", "custom"]),
  ticketChoice: z.enum(["keep", "move"]),
  tickets: z.array(
    z.looseObject({
      id: z.string().regex(/^act-[0-9a-hjkmnp-tv-z]{6}$/),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

export type ReleasePreparation = z.infer<typeof releasePreparationSchema>;
