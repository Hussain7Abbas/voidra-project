import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { processInfo } from "../src/process.ts";

it("reads the actual kernel PID/start identity without privileged ps and works in a filesystem sandbox", async () => {
  const binary = resolve("skills/voidra-go/scripts/process-info");
  const info = await processInfo(process.pid);
  expect(info).toMatchObject({ pid: process.pid, parentPid: process.ppid });
  expect(info?.identity).toMatch(/^macos:\d+:\d+$/);
  expect(await processInfo(2147483647)).toBeNull();
  expect(spawnSync(binary, []).status).toBe(2);
  expect(spawnSync(binary, ["invalid"]).status).toBe(2);
  expect(
    execFileSync(binary, ["--source-hash"], { encoding: "utf8" }).trim(),
  ).toMatch(/^[a-f0-9]{64}$/);
  const result = execFileSync(
    "/usr/bin/sandbox-exec",
    [
      "-p",
      "(version 1)(allow default)(deny file-write*)",
      binary,
      String(process.pid),
    ],
    { encoding: "utf8" },
  );
  expect(JSON.parse(result)).toEqual(info);
});
