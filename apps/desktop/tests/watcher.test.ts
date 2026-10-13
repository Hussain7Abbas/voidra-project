import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import {
  applyOperation,
  hash,
  parseRecord,
  recoverOperation,
  serializeRecord,
} from "voidra";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("publishes outside changes under a second, suppresses equal content and defers unfinished operations", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-watch-"));
  const root = join(temp, "project");
  await cp(resolve("fixtures/busy-project/project"), root, { recursive: true });
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
      VOIDRA_DATA_DIR: join(temp, "data"),
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await page.evaluate(() => {
      const w = window as unknown as { changes: number };
      w.changes = 0;
      window.voidra.subscribe((e) => {
        if (e.type === "changed") w.changes++;
      });
    });
    const path = ".voidra/actions/act-000012/action.md";
    const bytes = await readFile(join(root, path));
    const doc = parseRecord(path, bytes);
    const changed = serializeRecord(doc, {
      ...doc.data,
      title: "Edited outside the app",
    });
    const start = Date.now();
    await writeFile(join(root, path), changed);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { changes: number }).changes,
          ),
        { timeout: 1000, interval: 25 },
      )
      .toBe(1);
    expect(Date.now() - start).toBeLessThan(1000);
    await writeFile(join(root, path), changed);
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(
        () => (window as unknown as { changes: number }).changes,
      ),
    ).toBe(1);
    const prepared = serializeRecord(parseRecord(path, changed), {
      ...doc.data,
      title: "Prepared, not finished",
    });
    await expect(
      applyOperation(
        root,
        {
          id: "op-000099",
          changes: [
            { path, expectedHash: hash(changed), content: prepared.toString() },
          ],
        },
        {
          checkpoint(point) {
            if (point === "change-applied") throw new Error("Interrupted");
          },
        },
      ),
    ).rejects.toThrow("Interrupted");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await window.voidra.invoke({ command: "workspace" });
          return r.ok && r.data.kind === "workspace"
            ? r.data.workspace.diagnostics.map((d) => d.code)
            : [];
        }),
      )
      .toContain("incomplete-operation");
    const before = await page.evaluate(async () => {
      const r = await window.voidra.invoke({ command: "workspace" });
      return r.ok && r.data.kind === "workspace"
        ? r.data.workspace.actions.find((a) =>
            a.path.endsWith("act-000012/action.md"),
          )?.data.title
        : null;
    });
    expect(before).toBe("Edited outside the app");
    await recoverOperation(root, "op-000099");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await window.voidra.invoke({ command: "workspace" });
          return r.ok && r.data.kind === "workspace"
            ? r.data.workspace.actions.find((a) =>
                a.path.endsWith("act-000012/action.md"),
              )?.data.title
            : null;
        }),
      )
      .toBe("Prepared, not finished");
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 30000);
