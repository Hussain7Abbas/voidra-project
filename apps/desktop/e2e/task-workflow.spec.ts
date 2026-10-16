import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  checkProject,
  editAction,
  initializeProject,
  loadTemplate,
  projectTasks,
  readActionSequence,
} from "voidra";
import {
  commitResult,
  finalizeResult,
  prepareResult,
  publishPlanning,
  publishQuality,
  startRun,
} from "../../../tools/run-engine/src/run.ts";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`six-column task planning, queued implementation, QA, deletion and documentation tabs in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-workflow-ui-")),
      root = join(temp, "project"),
      data = join(temp, "data");
    await mkdir(root);
    await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
    await initializeProject(
      root,
      await loadTemplate(resolve("../../templates/general/template.yaml")),
      {
        name: "Workflow fixture",
        answers: { "problem.goal": { value: "Document fixture behavior" } },
      },
    );
    const first = projectTasks(await checkProject(root)).find(
      (task) => task.title === "Bootstrap",
    );
    if (!first) throw Error("Missing fixture");
    await editAction(root, {
      id: first.id,
      revision: first.revision,
      cancel: true,
    });
    await mkdir(join(root, "docs"));
    await writeFile(
      join(root, "docs/intro.md"),
      "# Explore notes\n\nSearchable **documentation**.\n",
    );
    await writeFile(
      join(root, "GLOSSARY.md"),
      "# Glossary\n\n**Ticket**: one task.\n",
    );
    await mkdir(data);
    await writeFile(
      join(data, "settings.json"),
      JSON.stringify({
        version: 1,
        recents: [],
        theme,
        skillsOfferSeen: true,
        defaultClient: "codex",
      }),
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Workflow verification"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.email", "workflow@example.test"], {
      cwd: root,
    });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "Prepare fixture"], { cwd: root });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const app = await launchConfiguredApp({
      args: [resolve("."), `--project=${root}`],
      env: { ...env, VOIDRA_DATA_DIR: data },
    });
    try {
      const page = await app.firstWindow();
      await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
      const nav = page.getByRole("navigation", { name: "Project pages" });
      for (const name of ["Run", "Glossary", "Decisions"])
        await expect(
          nav.getByRole("button", { name, exact: true }),
        ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Add to Backlog", exact: true }),
      ).toHaveCount(0);
      for (const name of [
        "Backlog",
        "Planning",
        "TODO",
        "In progress",
        "Review",
        "Done",
      ])
        await expect(
          page.getByRole("region", { name: `${name} tasks`, exact: true }),
        ).toBeAttached();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Create action",
        exact: true,
      });
      await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Documentation workflow");
      await dialog
        .getByLabel("Description", { exact: true })
        .fill("Document **all** boundaries.");
      await dialog
        .getByLabel("Action type", { exact: true })
        .selectOption("docs");
      await dialog
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(dialog).toBeHidden({ timeout: 30000 });
      const getTask = async () => {
        const task = projectTasks(await checkProject(root)).find(
          (t) => t.title === "Documentation workflow",
        );
        if (!task) throw Error("Missing task");
        return task;
      };
      const startSettledRun = async () => {
        // A watched column/answer can appear before its grouped write finishes.
        // Wait at the read-only boundary; never retry a run-start side effect.
        await expect
          .poll(async () => (await checkProject(root)).diagnostics)
          .toEqual([]);
        return startRun(root, "codex", process.pid);
      };
      const task = await getTask();
      const firstGrip = page.getByRole("button", {
        name: `Move ${task.title}; use left or right arrow`,
        exact: true,
      });
      await expect(firstGrip).toBeEnabled();
      await firstGrip.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => (await getTask()).column).toBe("planning");
      await expect(
        page
          .getByRole("region", { name: "Planning tasks", exact: true })
          .getByRole("button", {
            name: `Move ${task.title}; use left or right arrow`,
            exact: true,
          }),
      ).toBeEnabled();
      const planning = await startSettledRun();
      if (!planning) throw Error("Planning missing");
      await publishPlanning(root, planning.ownerToken, {
        action: task.id,
        kind: "questions",
        questions: [
          {
            text: "Who reads these **notes**?",
            why: "Cover access edge cases",
            options: [
              { label: "a", description: "Project members", recommended: true },
              { label: "b", description: "Anyone", recommended: false },
            ],
          },
        ],
      });
      const waiting = page.locator("#waiting-panel");
      await expect(waiting).toBeVisible();
      await waiting
        .getByRole("button", { name: "Who reads these notes?", exact: true })
        .click();
      await waiting.getByRole("radio", { name: /Project members/ }).check();
      await waiting
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(
        waiting.getByRole("button", { name: "Save answer", exact: true }),
      ).toHaveCount(0);
      const resumed = await startSettledRun();
      if (!resumed) throw Error("Answered planning missing");
      await publishPlanning(root, resumed.ownerToken, {
        action: task.id,
        kind: "plan",
        requirements:
          "## Goal\nDocument notes.\n\n## Out of scope\nSource code changes.",
        blueprint:
          "## Approach\nEdit docs.\n\n## Testing seams\nRead the document.\n\n## Proposed ADRs\nNone.",
        acceptance: "- [ ] Complete documentation.\n- [ ] QA/security pass.",
      });
      await expect.poll(async () => (await getTask()).column).toBe("todo");
      expect(
        readActionSequence(await checkProject(root)).pending,
      ).not.toContain(task.id);
      await page
        .getByRole("button", { name: "Hide Waiting for you", exact: true })
        .click();
      await expect(
        page
          .getByRole("region", { name: "TODO tasks", exact: true })
          .getByRole("button", { name: task.title, exact: true }),
      ).toBeVisible();
      const grip = page.getByRole("button", {
        name: `Move ${task.title}; use left or right arrow`,
        exact: true,
      });
      await grip.scrollIntoViewIfNeeded();
      await expect(grip).toBeEnabled();
      await grip.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(async () => (await getTask()).column)
        .toBe("in-progress");
      await expect(grip).toBeEnabled();
      const implement = await startSettledRun();
      if (!implement) throw Error("Implementation missing");
      await writeFile(
        join(root, "docs/intro.md"),
        "# Explore notes\n\nComplete **documentation** for project members.\n",
      );
      await prepareResult(root, implement.ownerToken, {
        summary: "Updated documentation",
        paths: ["docs/intro.md"],
        checks: [{ name: "Read documented behavior", passed: true }],
      });
      await commitResult(root, implement.ownerToken, "Document workflow");
      await finalizeResult(root, implement.ownerToken);
      const qa = await startSettledRun();
      if (!qa) throw Error("QA missing");
      const checks = {
        summary: "Read-only fixture verification",
        checks: [
          {
            name: "Actual document inspection",
            passed: true,
            evidence:
              "Document retains heading, intended audience and complete text; no executable/source change",
          },
        ],
      };
      await publishQuality(root, qa.ownerToken, {
        summary: "QA and security verified",
        decision: "pass",
        qa: checks,
        security: checks,
      });
      await expect.poll(async () => (await getTask()).column).toBe("done");
      await page
        .getByRole("button", { name: "Documentation", exact: true })
        .click();
      const tabs = page.getByRole("tablist", {
        name: "Documentation sections",
      });
      await tabs.getByRole("tab", { name: "Explore", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        tabs.getByRole("tab", { name: "Glossary", exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole("heading", { name: "Glossary", exact: true }).first(),
      ).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(
        tabs.getByRole("tab", { name: "Decisions", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Home");
      await expect(
        tabs.getByRole("tab", { name: "Explore", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await page
        .getByRole("button", { name: "Documentation workflow", exact: true })
        .scrollIntoViewIfNeeded();
      await page
        .getByRole("button", { name: "Documentation workflow", exact: true })
        .click();
      await expect(page.locator("main .action-meta")).toContainText("Done");
      await page
        .getByRole("button", { name: "Delete task", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Delete this task?", exact: true })
        .getByRole("button", { name: "Delete task", exact: true })
        .click();
      await expect.poll(async () => (await getTask()).archived).toBe(true);
      expect(
        await readFile(
          join(root, `.voidra/actions/${task.id}/action.md`),
          "utf8",
        ),
      ).toContain("qualityRun:");
      await page
        .getByRole("group", { name: "Edit history", exact: true })
        .getByRole("button", { name: "Undo Delete task", exact: true })
        .click();
      await expect.poll(async () => (await getTask()).archived).toBe(false);
      await expect(
        page
          .getByRole("region", { name: "Done tasks", exact: true })
          .getByRole("button", { name: task.title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Waiting for you", exact: true })
        .click();
      const geometry = await page.evaluate(() => {
        const right = document
          .querySelector(
            ".pane-resize-control-vertical[aria-label='Actions resize controls']",
          )
          ?.getBoundingClientRect();
        const bottom = document
          .querySelector(
            ".pane-resize-control-horizontal[aria-label='Waiting for you resize controls']",
          )
          ?.getBoundingClientRect();
        return { right: right?.width, bottom: bottom?.height };
      });
      expect(geometry).toEqual({ right: 1, bottom: 1 });
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/task-workflow-${theme}.png`),
      });
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
