import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`Tasks shows six columns and one card per promoted task in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-tasks-"));
    const root = join(temp, "project");
    await cp(resolve("../../fixtures/busy-project/project"), root, {
      recursive: true,
    });
    await rm(join(root, ".voidra/local/run.lock"), { force: true });
    await writeFile(join(root, "package.json"), '{"version":"0.0.0"}');
    await mkdir(join(root, "apps/web"), { recursive: true });
    await writeFile(join(root, "apps/web/package.json"), '{"version":"2.3.4"}');
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const app = await launchConfiguredApp({
      args: [resolve("."), `--project=${root}`],
      env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance" }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Tasks", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator("summary").filter({ hasText: "Release settings" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .locator("summary")
        .filter({ hasText: "Release settings" })
        .click();
      await expect(
        page.getByText("Current release 2.3.4", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Version source", { exact: true })
        .selectOption("package");
      await page
        .getByLabel("Release package", { exact: true })
        .fill("apps/web/package.json");
      await page
        .getByRole("button", { name: "Use package", exact: true })
        .click();
      await expect(
        page.getByText("Current release 2.3.4", { exact: true }),
      ).toBeVisible();
      await writeFile(
        join(root, "apps/web/package.json"),
        '{"version":"2.4.0"}',
      );
      await expect(
        page.getByText("Current release 2.4.0", { exact: true }),
      ).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
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
        ).toBeVisible();
      await expect(
        page.getByText("From idea-000000", { exact: true }),
      ).toHaveCount(1);
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .locator("summary")
        .filter({ hasText: "Release settings" })
        .click();
      const beforeUpgrade = await readFile(join(root, ".voidra/voidra.json"));
      await page
        .getByRole("button", {
          name: "Review task tracking upgrade",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Enable release-aware tasks" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await readFile(join(root, ".voidra/voidra.json"))).toEqual(
        beforeUpgrade,
      );
      await page
        .getByRole("button", {
          name: "Review task tracking upgrade",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Enable task tracking", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Enable release-aware tasks" }),
      ).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByText("Release-aware task tracking enabled", { exact: true }),
      ).toBeVisible();
      await page.evaluate(async () => {
        const snapshot = await window.voidra.invoke({ command: "workspace" });
        if (
          !snapshot.ok ||
          snapshot.data.kind !== "workspace" ||
          !snapshot.data.workspace.editing.undo.revision
        )
          throw Error("Missing undo");
        const result = await window.voidra.invoke({
          command: "undo",
          revision: snapshot.data.workspace.editing.undo.revision,
        });
        if (!result.ok) throw Error(result.error.message);
      });
      expect(await readFile(join(root, ".voidra/voidra.json"))).toEqual(
        beforeUpgrade,
      );
      await page.evaluate(async () => {
        const snapshot = await window.voidra.invoke({ command: "workspace" });
        if (
          !snapshot.ok ||
          snapshot.data.kind !== "workspace" ||
          !snapshot.data.workspace.editing.redo.revision
        )
          throw Error("Missing redo");
        const result = await window.voidra.invoke({
          command: "redo",
          revision: snapshot.data.workspace.editing.redo.revision,
        });
        if (!result.ok) throw Error(result.error.message);
      });
      await expect(
        page.getByText("Release-aware task tracking enabled", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      const created = await page.evaluate(async () =>
        window.voidra.invoke({
          command: "create-action",
          type: "docs",
          title: "Release aware addition",
          description: "Capture current release.",
        }),
      );
      expect(created.ok).toBe(true);
      if (!created.ok || created.data.kind !== "workspace")
        throw Error("Missing created task");
      expect(
        created.data.workspace.tasks.find(
          (task) => task.title === "Release aware addition",
        ),
      ).toMatchObject({ targetRelease: "2.4.0" });
      const added = created.data.workspace.tasks.find(
        (task) => task.title === "Release aware addition",
      );
      if (!added) throw Error("Missing created task");
      expect(
        (
          await page.evaluate((input) => window.voidra.invoke(input), {
            command: "move-task",
            id: added.id,
            revision: added.revision,
            column: "backlog",
          } as const)
        ).ok,
      ).toBe(true);
      await expect(
        page
          .getByRole("region", { name: "Backlog tasks", exact: true })
          .getByRole("button", { name: "Release aware addition", exact: true }),
      ).toBeVisible();
      await writeFile(
        join(root, "apps/web/package.json"),
        '{"version":"2.5.0"}',
      );
      await expect(
        page.locator(
          'select[data-task-release-filter] option[value="current"]',
        ),
      ).toHaveText("Current · 2.5.0");
      await page
        .getByRole("button", {
          name: "Move Release aware addition to Planning",
          exact: true,
        })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Planning tasks", exact: true })
          .getByRole("button", { name: "Release aware addition", exact: true }),
      ).toBeVisible();
      const moved = await page.evaluate(async () =>
        window.voidra.invoke({ command: "workspace" }),
      );
      if (!moved.ok || moved.data.kind !== "workspace")
        throw Error("Missing moved task");
      expect(
        moved.data.workspace.tasks.find(
          (task) => task.title === "Release aware addition",
        ),
      ).toMatchObject({
        targetRelease: "2.4.0",
        stage: "implement",
        status: "ready",
      });
      const capture = await page.evaluate(async () =>
        window.voidra.invoke({
          command: "create-action",
          type: "docs",
          title: "Unassigned task",
          description: "Capture first",
          taskColumn: "backlog",
          targetRelease: null,
        }),
      );
      expect(capture.ok).toBe(true);
      await page
        .getByRole("button", {
          name: "Move Unassigned task to Planning",
          exact: true,
        })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Planning tasks", exact: true })
          .getByRole("button", { name: "Unassigned task", exact: true }),
      ).toBeVisible();
      const assigned = await page.evaluate(async () =>
        window.voidra.invoke({ command: "workspace" }),
      );
      if (!assigned.ok || assigned.data.kind !== "workspace")
        throw Error("Missing assigned task");
      expect(
        assigned.data.workspace.tasks.find(
          (task) => task.title === "Unassigned task",
        ),
      ).toMatchObject({ targetRelease: "2.5.0" });
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await page.getByRole("radio", { name: "Normal", exact: true }).check();
      await page
        .getByLabel("Title", { exact: true })
        .fill("Unversioned backlog capture");
      await page
        .getByLabel("Description", { exact: true })
        .fill("Leave release unassigned.");
      await expect(
        page.getByLabel("Target release", { exact: true }),
      ).toHaveValue("2.5.0");
      await page.getByLabel("Target release", { exact: true }).selectOption("");
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      const saved = await page.evaluate(async () =>
        window.voidra.invoke({ command: "workspace" }),
      );
      if (!saved.ok || saved.data.kind !== "workspace")
        throw Error("Missing backlog task");
      expect(
        saved.data.workspace.tasks.find(
          (task) => task.title === "Unversioned backlog capture",
        ),
      ).toMatchObject({ targetRelease: null, column: "backlog" });
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Parent slice", exact: true }),
      ).toHaveCount(1);
      await expect(page.getByText("Cancelled", { exact: true })).toHaveCount(0);
      await page
        .getByLabel("Include deleted, cancelled and rejected tasks")
        .check();
      expect(
        await page.getByText("Cancelled", { exact: true }).count(),
      ).toBeGreaterThan(0);
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`tasks-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Parent slice", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Parent slice",
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
