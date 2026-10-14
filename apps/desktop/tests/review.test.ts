import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { checkProject, parseRecord, reviewRevision, schemas } from "voidra";
import {
  commitResult,
  finalizeResult,
  prepareResult,
  startRun,
} from "../../../tools/run-engine/src/run.ts";
import { fixture, report } from "../../../tools/run-engine/tests/helpers.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("rejects review with feedback, supports a follow-up run and accepts only the displayed result revision", async () => {
  const root = await fixture(),
    data = await mkdtemp(join(tmpdir(), "voidra-review-"));
  async function run() {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    await writeFile(
      join(root, "README.md"),
      `# Fixture\nUpdated ${ctx.run}.\n`,
    );
    await prepareResult(root, ctx.ownerToken, report);
    await commitResult(root, ctx.ownerToken, "Document installation");
    await finalizeResult(root, ctx.ownerToken);
  }
  await run();
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
    await page
      .getByRole("button", { name: "Document installation", exact: true })
      .click();
    expect(
      await page.getByRole("button", { name: "Reject", exact: true }).count(),
    ).toBe(1);
    const actionPath = join(root, ".voidra/actions/act-000000/action.md"),
      beforeRejected = await readFile(actionPath);
    const rejectedRefresh = await page.evaluate(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe = () => {};
      const refreshed = new Promise<boolean>((resolve) => {
        unsubscribe = window.voidra.subscribe((event) => {
          if (event.type === "changed") resolve(true);
        });
        timer = setTimeout(() => resolve(false), 5000);
      });
      try {
        const result = await window.voidra.invoke({
          command: "review-action",
          id: "act-000000",
          decision: "accepted",
          revision: "0".repeat(64),
          feedback: "",
        });
        return { ok: result.ok, refreshed: await refreshed };
      } finally {
        clearTimeout(timer);
        unsubscribe();
      }
    });
    expect(rejectedRefresh).toEqual({ ok: false, refreshed: true });
    expect(await readFile(actionPath)).toEqual(beforeRejected);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page
      .getByLabel("Feedback", { exact: true })
      .fill("Add troubleshooting instructions.");
    await page
      .getByRole("button", { name: "Send back to Implement", exact: true })
      .click();
    await page
      .getByText("Sent back for changes", { exact: true })
      .waitFor({ timeout: 5000 });
    await page
      .getByText("Add troubleshooting instructions.", { exact: true })
      .waitFor({ timeout: 5000 });
    const action = schemas.action.parse(
      parseRecord(
        ".voidra/actions/act-000000/action.md",
        await readFile(join(root, ".voidra/actions/act-000000/action.md")),
      ).data,
    );
    expect(action).toMatchObject({
      stage: "implement",
      status: "ready",
      reviewDecision: {
        decision: "rejected",
        feedback: "Add troubleshooting instructions.",
      },
    });
    await page
      .getByRole("button", { name: "Queue for agent", exact: true })
      .click();
    await page.getByText("Action queued", { exact: true }).waitFor();
    await run();
    await expect
      .poll(
        () =>
          page.getByRole("button", { name: "Accept", exact: true }).isVisible(),
        { timeout: 5000 },
      )
      .toBe(true);
    const snapshot = await page.evaluate(() =>
      window.voidra.invoke({ command: "workspace" }),
    );
    if (!snapshot.ok || snapshot.data.kind !== "workspace")
      throw new Error("Missing workspace");
    const revision = (
      snapshot.data.workspace.actions[0] as unknown as { revision: string }
    ).revision;
    const path = join(root, ".voidra/actions/act-000000/action.md");
    await writeFile(path, `${await readFile(path, "utf8")}\n`);
    const changedRevision = reviewRevision(
      await checkProject(root),
      "act-000000",
    );
    expect(changedRevision).not.toBe(revision);
    const stale = await page.evaluate(
      (revision) =>
        window.voidra.invoke({
          command: "review-action",
          id: "act-000000",
          decision: "accepted",
          revision,
          feedback: "",
        } as never),
      revision,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok)
      expect(stale.error.message).toContain("Review revision changed");
    try {
      await expect
        .poll(
          () =>
            page
              .locator("[data-review-revision]")
              .getAttribute("data-review-revision"),
          { timeout: 5000 },
        )
        .toBe(changedRevision);
    } catch (error) {
      const latest = await page.evaluate(() =>
        window.voidra.invoke({ command: "workspace" }),
      );
      console.error("Review refresh diagnostic", {
        stale,
        expected: changedRevision,
        visible: await page
          .locator("[data-review-revision]")
          .getAttribute("data-review-revision"),
        service:
          latest.ok && latest.data.kind === "workspace"
            ? latest.data.workspace.actions.map(({ data, revision }) => ({
                id: data.id,
                revision,
              }))
            : latest,
        alerts: await page.getByRole("alert").allTextContents(),
      });
      throw error;
    }
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await page
      .getByText("Action accepted", { exact: true })
      .waitFor({ timeout: 5000 });
    await expect
      .poll(
        async () =>
          schemas.action.parse(
            parseRecord(
              ".voidra/actions/act-000000/action.md",
              await readFile(path),
            ).data,
          ).stage,
      )
      .toBe("done");
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(data, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
