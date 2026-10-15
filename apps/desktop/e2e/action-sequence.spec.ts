import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import {
  checkProject,
  createAction,
  editAction,
  enableTaskTracking,
  hash,
  previewTaskTracking,
  readActionSequence,
} from "voidra";
import { failRun, startRun } from "../../../tools/run-engine/src/run.ts";

for (const theme of ["light", "dark"] as const)
  test(`Actions global order, warnings, pointer, keyboard and undo in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-sequence-ui-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
    const baseline = await checkProject(root);
    await editAction(root, {
      id: "act-000000",
      revision: hash(
        baseline.files.get(".voidra/actions/act-000000/action.md") ?? "",
      ),
      cancel: true,
    });
    await enableTaskTracking(root, {
      revision: (await previewTaskTracking(root)).revision,
    });
    const dependent = await createAction(root, {
      type: "docs",
      title: "Dependent task",
      description: "Second",
      by: "You",
    });
    const prerequisite = await createAction(root, {
      type: "docs",
      title: "Prerequisite task",
      description: "First",
      by: "You",
    });
    const project = await checkProject(root);
    await editAction(root, {
      id: dependent,
      revision: hash(
        project.files.get(`.voidra/actions/${dependent}/action.md`) ?? "",
      ),
      blockedBy: [prerequisite],
    });
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Voidra Verification"],
      ["config", "user.email", "verification@example.test"],
      ["add", "."],
      ["commit", "-qm", "Initial sequence fixture"],
    ])
      execFileSync("git", args, { cwd: root });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
      ),
    );
    const launch = () =>
      _electron.launch({
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      let sidebar = page.getByRole("complementary", {
        name: "Actions",
        exact: true,
      });
      await expect(
        sidebar.getByRole("region", { name: "Dependency order warning" }),
      ).toContainText("listed later");
      const order = async () =>
        readActionSequence(await checkProject(root)).order;
      expect(await order()).toEqual([dependent, prerequisite]);
      await page
        .getByLabel("Release", { exact: true })
        .selectOption("unassigned");
      await expect(
        sidebar
          .getByRole("list", { name: "Implementation order" })
          .getByRole("listitem"),
      ).toHaveCount(2);
      await sidebar
        .getByRole("button", { name: "Rearrange", exact: true })
        .click();
      await expect.poll(order).toEqual([prerequisite, dependent]);
      await page
        .getByRole("button", {
          name: "Undo Reorder Actions sequence",
          exact: true,
        })
        .click();
      await expect.poll(order).toEqual([dependent, prerequisite]);
      await expect(
        sidebar
          .getByRole("list", { name: "Implementation order" })
          .getByRole("listitem")
          .first(),
      ).toContainText("Dependent task");
      const handle = sidebar.getByRole("button", {
        name: "Reorder Prerequisite task; use Up or Down arrow",
        exact: true,
      });
      await expect(handle).toBeEnabled();
      await handle.focus();
      await page.keyboard.press("ArrowUp");
      await expect.poll(order).toEqual([prerequisite, dependent]);
      await expect(
        sidebar.getByRole("region", { name: "Dependency order warning" }),
      ).toHaveCount(0);
      await expect(handle).toBeEnabled();
      const box = await handle.boundingBox();
      const target = await sidebar
        .locator(`[data-sequence-id="${dependent}"]`)
        .boundingBox();
      if (!box || !target) throw Error("Missing sequence bounds");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect.poll(order).toEqual([dependent, prerequisite]);
      await expect(
        sidebar.getByRole("region", { name: "Dependency order warning" }),
      ).toBeVisible();
      // Stale action revisions remain bound to the original pointer gesture.
      await expect(handle).toBeEnabled();
      const start = await handle.boundingBox();
      if (!start) throw Error("Missing drag handle");
      await page.mouse.move(
        start.x + start.width / 2,
        start.y + start.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        start.x + start.width / 2,
        start.y + start.height / 2 - 6,
      );
      const path = join(root, `.voidra/actions/${dependent}/action.md`),
        raw = await readFile(path, "utf8");
      await writeFile(path, `${raw}\nExternal note.\n`);
      await expect
        .poll(async () => {
          const result = await page.evaluate(() =>
            window.voidra.invoke({ command: "workspace" }),
          );
          return result.ok && result.data.kind === "workspace"
            ? result.data.workspace.actions.find((a) => a.data.id === dependent)
                ?.editRevision
            : null;
        })
        .toBe(hash(`${raw}\nExternal note.\n`));
      const destination = await sidebar
        .locator(`[data-sequence-id="${dependent}"]`)
        .boundingBox();
      if (!destination) throw Error("Missing target");
      await page.mouse.move(
        destination.x + destination.width / 2,
        destination.y + destination.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect(
        sidebar.getByRole("region", { name: "Unsaved Actions order" }),
      ).toBeVisible();
      expect(await order()).toEqual([dependent, prerequisite]);
      await sidebar
        .getByRole("button", { name: "Dismiss proposed order" })
        .click();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/v11-p06-actions-${theme}.png`),
      });
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      sidebar = page.getByRole("complementary", {
        name: "Actions",
        exact: true,
      });
      await expect(
        sidebar
          .getByRole("list", { name: "Implementation order" })
          .getByRole("listitem")
          .first(),
      ).toContainText("Dependent task");
      await sidebar
        .getByRole("button", { name: "Rearrange", exact: true })
        .click();
      await expect.poll(order).toEqual([prerequisite, dependent]);
      await expect(
        page.getByRole("button", {
          name: "Undo Reorder Actions sequence",
          exact: true,
        }),
      ).toBeEnabled();
      const run = await startRun(root, "codex", process.pid);
      if (!run) throw Error("Missing eligible prerequisite run");
      expect(run.action).toBe(prerequisite);
      await failRun(root, run.ownerToken, "Verify consumed undo boundary");
      await expect
        .poll(async () => {
          const result = await page.evaluate(() =>
            window.voidra.invoke({ command: "workspace" }),
          );
          return result.ok && result.data.kind === "workspace"
            ? result.data.workspace.editing.undo.blocked
            : null;
        })
        .toContain("consumed this edit");
      expect(
        readActionSequence(await checkProject(root)).pending,
      ).not.toContain(prerequisite);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
