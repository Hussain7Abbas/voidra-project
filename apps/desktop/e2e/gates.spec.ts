import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, createAction, planFiles } from "voidra";
import { publishFakeGate } from "../../../tools/fake-agent/src/gates.ts";

for (const theme of ["light", "dark"] as const)
  test(`question rounds, plan revisions, review and inbox in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-gates-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const id = await createAction(root, {
      type: "feature",
      title: "Export notes",
      description: "A private export.",
      by: "You",
    });
    await publishFakeGate(root, id, "questions");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const app = await _electron.launch({
      args: [resolve("."), `--project=${root}`],
      env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.keyboard.press("Escape");
      async function axe() {
        expect(
          (await new AxeBuilder({ page }).setLegacyMode().analyze()).violations,
        ).toEqual([]);
      }
      const nav = page.getByRole("button", {
        name: "Waiting for you",
        exact: true,
      });
      await nav.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Waiting for you", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Who can read the notes?", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await axe();
      await page
        .getByRole("radio", { name: "a · Recommended Only the owner" })
        .check();
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await nav.click();
      await page
        .getByRole("button", { name: "Who can read the notes?", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Restore draft .*Unfinished answer/ })
        .click();
      await expect(
        page.getByRole("radio", { name: "a · Recommended Only the owner" }),
      ).toBeChecked();
      const questionPath = join(root, `.voidra/actions/${id}/questions.md`);
      await writeFile(
        questionPath,
        `${await readFile(questionPath, "utf8")} \n`,
      );
      await page
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Questions changed" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Reload question", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Reload question", exact: true }),
      ).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByRole("radio", { name: "a · Recommended Only the owner" }),
      ).toBeEnabled();
      await page
        .getByRole("radio", { name: "a · Recommended Only the owner" })
        .check();
      await page
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(page.getByText("Answer: a", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Queue for agent", exact: true }),
      ).toBeEnabled();
      await publishFakeGate(root, id, "questions");
      await page
        .getByRole("radio", { name: "Let the agent decide", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(
        page.getByText("Answer: Let the agent decide", { exact: true }),
      ).toBeVisible();
      await publishFakeGate(root, id, "assumption");
      await expect(
        page.getByText("Use JSON export", { exact: true }),
      ).toBeVisible();
      await axe();
      await publishFakeGate(root, id, "plan");
      await page
        .getByRole("button", { name: "Request changes", exact: true })
        .click();
      await page
        .getByLabel("Feedback", { exact: true })
        .fill("Make the output deterministic.");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Request changes", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Restore draft .*Make the output deterministic/,
        })
        .click();
      await expect(page.getByLabel("Feedback", { exact: true })).toContainText(
        "Make the output deterministic.",
      );
      await page
        .getByRole("button", { name: "Send back to Plan", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByText("Make the output deterministic.", { exact: true }),
      ).toBeVisible();
      await publishFakeGate(root, id, "plan");
      await page
        .getByRole("button", { name: "Approve plan", exact: true })
        .click();
      await expect(
        page.getByText("Plan approved", { exact: true }),
      ).toBeVisible();
      for (const file of planFiles) {
        const path = join(root, `.voidra/actions/${id}/${file}`);
        await writeFile(path, `${await readFile(path, "utf8")} \n`);
        await expect(
          page.getByRole("region", { name: "Plan approval" }),
        ).toContainText(`Changed files: ${file}`);
        await axe();
        await page
          .getByRole("button", { name: "Approve plan", exact: true })
          .click();
        await expect
          .poll(async () => (await checkProject(root)).diagnostics)
          .toEqual([]);
      }
      const snapshot = await page.evaluate(() =>
        window.voidra.invoke({ command: "workspace" }),
      );
      if (!snapshot.ok || snapshot.data.kind !== "workspace")
        throw new Error("Workspace missing");
      const displayed = snapshot.data.workspace.actions.find(
        (a) => a.data.id === id,
      )?.planRevision;
      const path = join(root, `.voidra/actions/${id}/requirements.md`);
      await writeFile(path, `${await readFile(path, "utf8")}Outside edit\n`);
      const stale = await page.evaluate(
        ({ id, revision }) =>
          window.voidra.invoke({ command: "approve-plan", id, revision }),
        { id, revision: displayed ?? "" },
      );
      expect(stale.ok).toBe(false);
      await expect(page.getByText("Outside edit")).toBeVisible();
      await page
        .getByRole("button", { name: "Approve plan", exact: true })
        .click();
      await expect
        .poll(async () => (await checkProject(root)).diagnostics)
        .toEqual([]);
      await publishFakeGate(root, id, "review");
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await page
        .getByLabel("Feedback", { exact: true })
        .fill("Include an empty export.");
      await page
        .getByRole("button", { name: "Send back to Implement", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByText("Include an empty export.", { exact: true }),
      ).toBeVisible();
      const reworkPlan = join(root, `.voidra/actions/${id}/blueprint.md`);
      await writeFile(reworkPlan, `${await readFile(reworkPlan, "utf8")} \n`);
      await expect(
        page.getByRole("region", { name: "Plan approval" }),
      ).toContainText("Changed files: blueprint.md");
      await page
        .getByRole("button", { name: "Approve plan", exact: true })
        .click();
      await expect
        .poll(async () => (await checkProject(root)).diagnostics)
        .toEqual([]);
      await publishFakeGate(root, id, "review");
      await axe();
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(
        page.getByText("Action accepted", { exact: true }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (await checkProject(root)).records.get(
              `.voidra/actions/${id}/action.md`,
            )?.document.data.stage,
        )
        .toBe("done");
      await page
        .getByRole("button", { name: "Back to inbox", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "You’re all caught up",
          exact: true,
        }),
      ).toBeVisible();
      await axe();
      await createAction(root, {
        type: "docs",
        title: "Create developer account",
        description: "Human account setup.",
        by: "You",
        doneBy: "you",
        steps: ["Confirm account access"],
      });
      await page
        .getByRole("button", { name: "Create developer account", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("checkbox", { name: "Confirm account access", exact: true })
        .check();
      await expect
        .poll(
          async () =>
            [...(await checkProject(root)).records.values()].find(
              (r) =>
                r.kind === "action" &&
                r.document.data.title === "Create developer account",
            )?.document.data.status,
        )
        .toBe("complete");
      await page
        .getByRole("button", { name: "Back to inbox", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "You’re all caught up",
          exact: true,
        }),
      ).toBeVisible();
      await axe();
      const finishedPlan = join(root, `.voidra/actions/${id}/blueprint.md`);
      await writeFile(
        finishedPlan,
        `${await readFile(finishedPlan, "utf8")} \n`,
      );
      await expect(
        page.getByRole("region", { name: "Planning file problems" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await page
        .getByRole("button", { name: "Export notes", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Plan history" }),
      ).toContainText("Finished plan changed");
      await expect(
        page.getByRole("button", { name: "Approve plan", exact: true }),
      ).toHaveCount(0);
      await axe();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
for (const type of ["research", "release"] as const)
  test(`${type} review rejection and acceptance use their lifecycle`, async () => {
    const temp = await mkdtemp(join(tmpdir(), `voidra-${type}-gate-`)),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const id = await createAction(root, {
      type,
      title: `Review ${type}`,
      description: "Scripted review gate.",
      by: "You",
    });
    if (type === "release") await publishFakeGate(root, id, "plan");
    await publishFakeGate(root, id, "review");
    const env = Object.fromEntries(
        Object.entries(process.env).filter(
          (p): p is [string, string] =>
            p[1] !== undefined &&
            !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
        ),
      ),
      app = await _electron.launch({
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
      });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page
        .getByRole("button", { name: `Review ${type}`, exact: true })
        .click();
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await page
        .getByLabel("Feedback", { exact: true })
        .fill("Clarify the recommendation.");
      await page
        .getByRole("button", {
          name: `Send back to ${type === "research" ? "Discovery" : "Plan"}`,
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect
        .poll(
          async () =>
            (await checkProject(root)).records.get(
              `.voidra/actions/${id}/action.md`,
            )?.document.data.stage,
        )
        .toBe(type === "research" ? "discovery" : "plan");
      await publishFakeGate(root, id, "review");
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(
        page.getByText("Action accepted", { exact: true }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (await checkProject(root)).records.get(
              `.voidra/actions/${id}/action.md`,
            )?.document.data.stage,
        )
        .toBe(type === "research" ? "done" : "review");
      if (type === "release")
        await expect(
          page.getByRole("button", { name: "Queue for agent", exact: true }),
        ).toBeEnabled();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode().analyze()).violations,
      ).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
