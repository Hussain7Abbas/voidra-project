import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { checkProject, parseRecord, serializeRecord } from "voidra";
import { processIdentity } from "../../../tools/run-engine/src/lock.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("queues an action, copies both agent commands and shows live/stale locks without permitting a live-owner recovery", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-queue-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/busy-project/project"), root, { recursive: true });
  await rm(join(root, ".voidra/local/run.lock"), { force: true });
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
    await page
      .getByRole("button", { name: "docs implement", exact: true })
      .click();
    expect(
      await page
        .getByRole("button", { name: "Queue for agent", exact: true })
        .count(),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Queue for agent", exact: true })
      .click();
    await page
      .getByText("Action queued", { exact: true })
      .waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.getByRole("heading", { name: "Run", exact: true }).waitFor();
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(
      await readFile(join(root, ".voidra/local/pending-actions.md"), "utf8"),
    ).toContain("act-00000z");
    const invoke = async (raw: unknown) =>
      page.evaluate((value) => window.voidra.invoke(value as never), raw);
    const shown = await invoke({ command: "workspace" });
    if (!shown.ok || shown.data.kind !== "workspace")
      throw new Error("Missing snapshot");
    const displayed = shown.data.workspace;
    const eligible = displayed.actions.filter((a) => a.queueable);
    expect(eligible.some((a) => a.data.id === "act-00000z")).toBe(true);
    expect(eligible.every((a) => a.data.doneBy === "agent")).toBe(true);
    const other = eligible.find((a) => a.data.id !== "act-00000z");
    if (!other) throw new Error("Expected another eligible action");
    const revisions = Object.fromEntries(
      eligible.map((a) => [a.data.id, a.editRevision]),
    );
    const ordered = [other.data.id, "act-00000z"];
    expect(
      (
        await invoke({
          command: "replace-queue",
          ids: ordered,
          revision: "0".repeat(64),
          revisions,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await invoke({
          command: "replace-queue",
          ids: ordered,
          revision: displayed.queueRevision,
          revisions,
        })
      ).ok,
    ).toBe(true);
    await page
      .getByRole("button", { name: "Move docs implement earlier", exact: true })
      .click();
    await page.getByText("Queue saved", { exact: true }).waitFor();
    const reordered = await invoke({ command: "workspace" });
    if (!reordered.ok || reordered.data.kind !== "workspace")
      throw new Error("Missing snapshot");
    expect(reordered.data.workspace.queue).toEqual([
      "act-00000z",
      other.data.id,
    ]);
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = async (text) => {
        (globalThis as unknown as { copied: string }).copied = text;
      };
    });
    await page
      .getByRole("button", { name: "Copy Claude Code command", exact: true })
      .click();
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { copied: string }).copied,
      ),
    ).toBe("/voidra-go");
    await page
      .getByRole("button", { name: "Copy Codex command", exact: true })
      .click();
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { copied: string }).copied,
      ),
    ).toBe("$voidra-go");
    const runPath =
      ".voidra/actions/act-00000z/runs/2026-10-13T000000Z-codex-run-999999.md";
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, ".voidra/actions/act-00000z/runs"), {
      recursive: true,
    });
    await writeFile(
      join(root, runPath),
      serializeRecord(
        parseRecord(runPath, "---\n{}\n---\n"),
        {
          id: "run-999999",
          action: "act-00000z",
          agent: "codex",
          startedAt: new Date().toISOString(),
          fromStage: "implement",
          outcome: "running",
          consumedRecords: ["act-00000z"],
        },
        "Started.\n",
      ),
    );
    const lock = {
      ownerToken: "test-owner",
      pid: process.pid,
      processStartedAt: await processIdentity(process.pid),
      agent: "codex",
      host: hostname(),
      run: "run-999999",
      action: "act-00000z",
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    };
    await writeFile(join(root, ".voidra/local/run.lock"), JSON.stringify(lock));
    await page
      .getByText("Agent running", { exact: true })
      .waitFor({ timeout: 5000 });
    await writeFile(
      join(root, ".voidra/local/run.lock"),
      JSON.stringify({ ...lock, heartbeatAt: "2026-10-12T00:00:00Z" }),
    );
    await page
      .getByText(/The agent may have stopped/)
      .waitFor({ timeout: 5000 });
    expect(
      await page
        .getByRole("button", { name: "Recover run", exact: true })
        .count(),
    ).toBe(0);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 30000);
