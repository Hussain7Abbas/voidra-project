import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import {
  commitResult,
  finalizeResult,
  prepareResult,
  startRun,
} from "../../../tools/run-engine/src/run.ts";
import { fixture, report } from "../../../tools/run-engine/tests/helpers.ts";
import type { WorkspaceSnapshot } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

// Workspace reads may take five seconds at the service boundary. A poll must
// allow that read to finish instead of using Vitest's one-second default.
const readWait = { timeout: 5000 };

it("holds the last complete action view until the prepared run and Git index are finalized", async () => {
  const root = await fixture(),
    data = await mkdtemp(join(tmpdir(), "voidra-run-index-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined && p[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const app = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${root}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: data,
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  const observations: Array<{
    phase: string;
    elapsedMs: number;
    stage: string | null;
    status: string | null;
    diagnostics: string[];
  }> = [];
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const read = async (phase: string): Promise<WorkspaceSnapshot> => {
      const started = performance.now();
      const response = await page.evaluate(() =>
        window.voidra.invoke({ command: "workspace" }),
      );
      if (!response.ok) throw new Error(response.error.message);
      if (response.data.kind !== "workspace")
        throw new Error("Expected a workspace response");
      const snapshot = response.data.workspace;
      observations.push({
        phase,
        elapsedMs: Math.round(performance.now() - started),
        stage: snapshot.actions[0]?.data.stage ?? null,
        status: snapshot.actions[0]?.data.status ?? null,
        diagnostics: snapshot.diagnostics.map((diagnostic) => diagnostic.code),
      });
      return snapshot;
    };
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    await expect
      .poll(
        async () => (await read("started")).actions[0]?.data.status,
        readWait,
      )
      .toBe("running");
    await writeFile(join(root, "README.md"), "# Fixture\nDocs updated.\n");
    await prepareResult(root, ctx.ownerToken, report);
    await expect
      .poll(
        async () =>
          (await read("prepared")).diagnostics.map(
            (diagnostic) => diagnostic.code,
          ),
        readWait,
      )
      .toContain("incomplete-run");
    expect((await read("held")).actions[0]?.data.stage).toBe("implement");
    const commit = await commitResult(
      root,
      ctx.ownerToken,
      "Document installation",
    );
    await finalizeResult(root, ctx.ownerToken);
    await expect
      .poll(async () => {
        const snapshot = await read("finalized");
        return {
          stage: snapshot.actions[0]?.data.stage,
          commitVisible: snapshot.actions[0]?.data.commits?.includes(commit),
          incomplete: snapshot.diagnostics.some(
            (diagnostic) => diagnostic.code === "incomplete-run",
          ),
          recoveryPending: snapshot.recoveries.some(
            (recovery) => recovery.kind === "run" && recovery.id === ctx.run,
          ),
          lock: snapshot.lock.state,
        };
      }, readWait)
      .toEqual({
        stage: "review",
        commitVisible: true,
        incomplete: false,
        recoveryPending: false,
        lock: "none",
      });
  } catch (error) {
    console.error("Run-index workspace reads:", JSON.stringify(observations));
    throw error;
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(data, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
