import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, createAction } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`orders and runs several actions with a keyboard in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-picker-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await writeFile(join(root, "README.md"), "# Fixture\n");
    const first = await createAction(root, {
      type: "docs",
      title: "First task",
      description: "Document installation",
      by: "You",
    });
    const second = await createAction(root, {
      type: "docs",
      title: "Second task",
      description: "Document installation",
      by: "You",
    });
    await createAction(root, {
      type: "docs",
      title: "Other teammate",
      description: "Document installation",
      by: "You",
      assignee: "Other <other@example.test>",
    });
    await createAction(root, {
      type: "docs",
      title: "Human task",
      description: "Confirm access",
      by: "You",
      doneBy: "you",
      steps: ["Confirm access"],
    });
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Voidra Verification"],
      ["config", "user.email", "verification@example.test"],
      ["add", "."],
      ["commit", "-qm", "Initial fixture"],
    ])
      execFileSync("git", args, { cwd: root });
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
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Run", exact: true }).click();
      const available = page.getByRole("region", {
        name: "Available actions",
        exact: true,
      });
      await expect(
        available.getByRole("button", {
          name: "Add Human task to queue",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(available.getByRole("listitem").last()).toContainText(
        "Other teammate",
      );
      const add = page.getByRole("button", {
        name: "Add First task to queue",
        exact: true,
      });
      await add.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", {
          name: "Remove First task from queue",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Add Second task to queue", exact: true })
        .click();
      const up = page.getByRole("button", {
        name: "Move Second task earlier",
        exact: true,
      });
      await up.focus();
      await page.keyboard.press("Enter");
      await expect
        .poll(
          async () =>
            (await checkProject(root)).records.get(
              ".voidra/local/pending-actions.md",
            )?.document.body,
        )
        .toContain(`1. [ ] ${second}\n2. [ ] ${first}`);
      await page.reload();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(
        page
          .getByRole("region", { name: "Run queue", exact: true })
          .getByRole("listitem")
          .first(),
      ).toContainText("Second task");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      for (const id of [second, first]) {
        execFileSync(
          process.execPath,
          [resolve("../../tools/fake-agent/src/cli-entry.ts"), root, "success"],
          { cwd: resolve("../..") },
        );
        await expect
          .poll(
            async () =>
              (await checkProject(root)).records.get(
                `.voidra/actions/${id}/action.md`,
              )?.document.data.stage,
          )
          .toBe("review");
      }
      await expect(
        page.getByRole("region", { name: "Run queue", exact: true }),
      ).toContainText("Choose an action to queue.");
      await page
        .getByRole("button", { name: "Commit planning changes", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(".voidra/");
      await page
        .getByLabel("Commit message", { exact: true })
        .fill("Share reviewed run records");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page
        .getByRole("button", { name: "Commit selected files", exact: true })
        .click();
      await expect(
        page.getByText("Planning changes committed", { exact: true }),
      ).toBeVisible({ timeout: 60000 });
      const changed = execFileSync(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
        { cwd: root, encoding: "utf8" },
      )
        .trim()
        .split("\n");
      expect(
        changed.every(
          (path) =>
            path.startsWith(".voidra/") && !path.startsWith(".voidra/local/"),
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await page
        .getByRole("button", { name: "First task", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Linked commits", exact: true }),
      ).toContainText("Document installation");
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
