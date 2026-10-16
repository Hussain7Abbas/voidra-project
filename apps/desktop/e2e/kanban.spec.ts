import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type CDPSession, expect, type Page, test } from "@playwright/test";
import {
  checkProject,
  createAction,
  enableTaskTracking,
  hash,
  previewTaskTracking,
  projectTasks,
} from "voidra";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

const grip = (page: Page, title: string) =>
  page.getByRole("button", {
    name: `Move ${title}; use left or right arrow`,
    exact: true,
  });
// Use a distinct pen pointer so the native desktop mouse cannot release its capture.
// Input goes through Chromium, rather than dispatching synthetic DOM events.
const pointers = new WeakMap<Page, CDPSession>();
async function pointer(
  page: Page,
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  x: number,
  y: number,
) {
  let session = pointers.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    pointers.set(page, session);
  }
  await session.send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    pointerType: "pen",
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    ...(type === "mouseMoved" ? {} : { clickCount: 1 }),
  });
}
async function beginDrag(page: Page, title: string) {
  const handle = grip(page, title);
  await expect(handle).toBeEnabled();
  await handle.hover();
  const box = await handle.boundingBox();
  if (!box) throw Error("Missing drag handle bounds");
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await pointer(page, "mousePressed", x, y);
  await pointer(page, "mouseMoved", x + 7, y);
}
async function finishDrag(page: Page, column: string) {
  const heading = page
    .getByRole("region", { name: `${column} tasks`, exact: true })
    .getByRole("heading");
  await heading.scrollIntoViewIfNeeded();
  const box = await heading.boundingBox();
  if (!box) throw Error("Missing column bounds");
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await pointer(page, "mouseMoved", x, y);
  await pointer(page, "mouseReleased", x, y);
}
for (const theme of ["light", "dark"] as const)
  test(`Kanban pointer, keyboard, release filters and stale moves in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-kanban-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await writeFile(join(root, "package.json"), '{"version":"1.2.0"}');
    await enableTaskTracking(root, {
      revision: (await previewTaskTracking(root)).revision,
    });
    const ready = await createAction(root, {
      type: "docs",
      title: "Pointer task",
      description: "Keep **source**.",
      by: "You",
      taskColumn: "backlog",
      targetRelease: null,
    });
    await createAction(root, {
      type: "docs",
      title: "Older release",
      description: "Keep its version.",
      by: "You",
      taskColumn: "backlog",
      targetRelease: "1.1.0",
    });
    await createAction(root, {
      type: "docs",
      title: "Missing release",
      description: "Needs a usable manifest.",
      by: "You",
      taskColumn: "backlog",
      targetRelease: null,
    });
    await createAction(root, {
      type: "docs",
      title: "Filter move",
      description: "Show where filtered work went.",
      by: "You",
      taskColumn: "backlog",
      targetRelease: null,
    });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
      ),
    );
    const app = await launchConfiguredApp(
      {
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
      },
      { theme },
    );
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const nav = page.getByRole("navigation", { name: "Project pages" });
      await expect(
        nav.getByRole("button", { name: "Backlog", exact: true }),
      ).toHaveCount(0);
      await expect(
        nav.getByRole("button", { name: "Actions", exact: true }),
      ).toHaveCount(0);
      const create = page.getByRole("button", {
        name: "Add task",
        exact: true,
      });
      await expect(create).toBeEnabled();
      await create.focus();
      await expect(create).toBeFocused();
      await page.keyboard.press("ControlOrMeta+n");
      await expect(
        page.getByRole("dialog", { name: "Create action", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      const task = async () =>
        projectTasks(await checkProject(root)).find(
          (task) => task.id === ready,
        );
      await beginDrag(page, "Pointer task");
      // A separate mouse pointer must neither replace nor release the active pen gesture.
      await page.mouse.down();
      await page.mouse.up();
      await finishDrag(page, "TODO");
      await expect.poll(task).toMatchObject({
        column: "todo",
        targetRelease: "1.2.0",
        stage: "implement",
        status: "ready",
      });
      await expect(grip(page, "Pointer task")).toBeEnabled();
      await beginDrag(page, "Pointer task");
      await finishDrag(page, "Backlog");
      await expect
        .poll(task)
        .toMatchObject({ column: "backlog", targetRelease: "1.2.0" });
      await beginDrag(page, "Pointer task");
      await page.keyboard.press("Escape");
      await finishDrag(page, "TODO");
      expect((await task())?.column).toBe("backlog");
      await beginDrag(page, "Pointer task");
      const path = join(root, `.voidra/actions/${ready}/action.md`),
        before = await readFile(path, "utf8");
      await writeFile(path, `${before}\nOutside note.\n`);
      await expect
        .poll(async () => {
          const result = await page.evaluate(() =>
            window.voidra.invoke({ command: "workspace" }),
          );
          return result.ok && result.data.kind === "workspace"
            ? result.data.workspace.tasks.find((task) => task.id === ready)
                ?.revision
            : null;
        })
        .toBe(hash(`${before}\nOutside note.\n`));
      await finishDrag(page, "TODO");
      await expect(
        page.getByText("Task changed on disk; refresh before moving it", {
          exact: true,
        }),
      ).toBeVisible();
      expect((await task())?.column).toBe("backlog");
      await beginDrag(page, "Pointer task");
      await finishDrag(page, "TODO");
      await expect.poll(task).toMatchObject({ column: "todo" });
      await expect(grip(page, "Pointer task")).toBeEnabled();
      await grip(page, "Pointer task").focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByText(
          "Run, review and completion columns follow lifecycle gates",
          { exact: true },
        ),
      ).toBeVisible();
      expect((await task())?.column).toBe("todo");
      await page.getByLabel("Release", { exact: true }).selectOption("current");
      await expect(
        page.getByRole("button", { name: "Older release", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Pointer task", exact: true }),
      ).toBeVisible();
      await page.getByLabel("Release", { exact: true }).selectOption("1.1.0");
      await expect(
        page.getByRole("button", { name: "Older release", exact: true }),
      ).toBeVisible();
      await beginDrag(page, "Older release");
      await finishDrag(page, "TODO");
      await expect
        .poll(async () =>
          projectTasks(await checkProject(root)).find(
            (task) => task.title === "Older release",
          ),
        )
        .toMatchObject({ column: "todo", targetRelease: "1.1.0" });
      await page
        .getByLabel("Release", { exact: true })
        .selectOption("unassigned");
      await expect(
        page.getByRole("button", { name: "Missing release", exact: true }),
      ).toBeVisible();
      await expect(grip(page, "Filter move")).toBeEnabled();
      await grip(page, "Filter move").focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByText("Moved to Planning. Hidden by the current filters.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByLabel("Release", { exact: true })).toBeFocused();
      await writeFile(join(root, "package.json"), "{}");
      await expect(
        page.getByText("Current release 1.2.0", { exact: true }),
      ).toHaveCount(0);
      await beginDrag(page, "Missing release");
      await finishDrag(page, "TODO");
      await expect(
        page.getByRole("button", { name: "Missing release", exact: true }),
      ).toBeVisible();
      expect(
        projectTasks(await checkProject(root)).find(
          (task) => task.title === "Missing release",
        ),
      ).toMatchObject({ column: "backlog", targetRelease: null });
      await page.getByLabel("Release", { exact: true }).selectOption("all");
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].every((button) =>
          button
            .getAnimations()
            .every((animation) => animation.playState !== "running"),
        ),
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath(`kanban-${theme}.png`),
      });
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
