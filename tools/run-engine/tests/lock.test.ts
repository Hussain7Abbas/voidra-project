import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  HEARTBEAT_STALE_MS,
  inspectLock,
  processIdentity,
} from "../src/lock.ts";

const at = Date.parse("2026-10-13T00:10:00Z");
const lock = {
  ownerToken: "owner-a",
  pid: process.pid,
  processStartedAt: JSON.parse(
    execFileSync(
      resolve("skills/voidra-go/scripts/process-info"),
      [String(process.pid)],
      { encoding: "utf8" },
    ),
  ).identity as string,
  agent: "codex" as const,
  host: hostname(),
  run: "run-000000",
  action: "act-000000",
  startedAt: "2026-10-13T00:00:00Z",
  heartbeatAt: "2026-10-13T00:09:59Z",
};
it("identifies real processes and refuses recovery of a live owner with an old heartbeat", async () => {
  expect(await processIdentity(process.pid)).toBe(lock.processStartedAt);
  expect(await processIdentity(2147483647)).toBeNull();
  expect((await inspectLock(lock, at)).state).toBe("running");
  const stale = await inspectLock(
    {
      ...lock,
      heartbeatAt: new Date(at - HEARTBEAT_STALE_MS - 1).toISOString(),
    },
    at,
  );
  expect(stale).toMatchObject({ state: "stale", recoverable: false });
});
it("allows a dead owner or reused PID, preserves unverifiable remote ownership and rejects invalid locks", async () => {
  expect(await inspectLock({ ...lock, pid: 2147483647 }, at)).toMatchObject({
    state: "interrupted",
    recoverable: true,
  });
  expect(
    await inspectLock({ ...lock, processStartedAt: "macos:0:0" }, at),
  ).toMatchObject({ state: "interrupted", recoverable: true });
  expect(
    await inspectLock({ ...lock, host: "other-computer" }, at),
  ).toMatchObject({ state: "stale", recoverable: false });
  expect(await inspectLock({ pid: 1 }, at)).toMatchObject({
    state: "invalid",
    recoverable: false,
  });
  expect(await inspectLock(null, at)).toMatchObject({
    state: "none",
    recoverable: false,
  });
});
