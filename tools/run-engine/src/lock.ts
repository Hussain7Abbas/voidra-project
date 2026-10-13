import { hostname } from "node:os";
import { schemas } from "voidra";

import { processInfo } from "./process.ts";
export const HEARTBEAT_STALE_MS = 120_000;
export interface LockView {
  state: "none" | "running" | "stale" | "interrupted" | "invalid";
  recoverable: boolean;
  message: string;
  action?: string;
  run?: string;
}
export async function processIdentity(pid: number): Promise<string | null> {
  return (await processInfo(pid))?.identity ?? null;
}
export async function inspectLock(
  input: unknown,
  now = Date.now(),
): Promise<LockView> {
  if (input === null)
    return { state: "none", recoverable: false, message: "No agent running" };
  const parsed = schemas.lock.safeParse(input);
  if (!parsed.success)
    return {
      state: "invalid",
      recoverable: false,
      message: "The run lock is invalid. Inspect its file before changing it.",
    };
  const lock = parsed.data,
    base = { action: lock.action, run: lock.run };
  if (lock.host !== hostname())
    return {
      ...base,
      state: "stale",
      recoverable: false,
      message:
        "The lock belongs to another computer; its owner cannot be verified here.",
    };
  let identity: string | null;
  try {
    identity = await processIdentity(lock.pid);
  } catch {
    return {
      ...base,
      state: "stale",
      recoverable: false,
      message: "The lock owner could not be verified; recovery is blocked.",
    };
  }
  if (
    identity?.startsWith("macos:") &&
    !lock.processStartedAt.startsWith("macos:")
  )
    return {
      ...base,
      state: "stale",
      recoverable: false,
      message:
        "The live process has a legacy start identity that cannot be verified safely.",
    };
  if (identity !== lock.processStartedAt)
    return {
      ...base,
      state: "interrupted",
      recoverable: true,
      message:
        "The run ended without a completed result. Its owner has stopped.",
    };
  if (now - Date.parse(lock.heartbeatAt) >= HEARTBEAT_STALE_MS)
    return {
      ...base,
      state: "stale",
      recoverable: false,
      message:
        "The agent may have stopped, but its owner is still alive. Recovery cannot clear this lock.",
    };
  return {
    ...base,
    state: "running",
    recoverable: false,
    message: "Agent running",
  };
}
