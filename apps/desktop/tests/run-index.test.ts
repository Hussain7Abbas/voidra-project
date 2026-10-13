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
import { nativeCoverageDirectory } from "./coverage-setup.ts";

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
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await window.voidra.invoke({ command: "workspace" });
          return r.ok && r.data.kind === "workspace"
            ? r.data.workspace.actions[0]?.data.status
            : null;
        }),
      )
      .toBe("running");
    await writeFile(join(root, "README.md"), "# Fixture\nDocs updated.\n");
    await prepareResult(root, ctx.ownerToken, report);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await window.voidra.invoke({ command: "workspace" });
          return r.ok && r.data.kind === "workspace"
            ? r.data.workspace.diagnostics.map((d) => d.code)
            : [];
        }),
      )
      .toContain("incomplete-run");
    expect(
      await page.evaluate(async () => {
        const r = await window.voidra.invoke({ command: "workspace" });
        return r.ok && r.data.kind === "workspace"
          ? r.data.workspace.actions[0]?.data.stage
          : null;
      }),
    ).toBe("implement");
    await commitResult(root, ctx.ownerToken, "Document installation");
    await finalizeResult(root, ctx.ownerToken);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await window.voidra.invoke({ command: "workspace" });
          return r.ok && r.data.kind === "workspace"
            ? r.data.workspace.actions[0]?.data.stage
            : null;
        }),
      )
      .toBe("review");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(data, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
