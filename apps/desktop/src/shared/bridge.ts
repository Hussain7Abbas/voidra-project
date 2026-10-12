import { z } from "zod";
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
export const requestSchema = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("snapshot") }),
  z.strictObject({ command: z.literal("choose-folder") }),
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
