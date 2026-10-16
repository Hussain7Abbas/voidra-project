import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

let application: ElectronApplication;
let page: Page;
let root: string;
async function ready(window: Page): Promise<void> {
  await window.locator('[data-app-ready="true"]').waitFor();
}
async function axe(window: Page): Promise<void> {
  const report = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .analyze();
  expect(report.violations).toEqual([]);
}
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "voidra-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
    ),
  );
  application = await launchConfiguredApp({
    args: [resolve(".")],
    env: { ...env, VOIDRA_DATA_DIR: root },
  });
  page = await application.firstWindow();
  await ready(page);
});
test.afterEach(async () => {
  await application?.close();
  await rm(root, { recursive: true, force: true });
});
for (const theme of ["light", "dark"] as const)
  test(`keyboard, project windows, missing folders and axe in ${theme}`, async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Appearance", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await axe(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeFocused();
    await axe(page);
    const one = join(root, "one");
    const two = join(root, "two");
    await mkdir(one);
    await mkdir(two);
    const canonicalOne = await realpath(one);
    const canonicalTwo = await realpath(two);
    // Only the OS chooser is substituted; windows, filesystem, IPC and utility processes are real.
    await application.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, one);
    const opened = application.waitForEvent("window");
    await page
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    const first = await opened;
    await ready(first);
    await expect(
      first.getByRole("heading", { name: "one", exact: true }),
    ).toBeVisible();
    await axe(first);
    await first.getByRole("button", { name: "one", exact: true }).click();
    await expect(
      first.getByRole("region", { name: "Recent projects" }),
    ).toBeVisible();
    await axe(first);
    await first
      .getByRole("button", { name: "Remove one from recents" })
      .click();
    await axe(first);
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(first.getByRole("dialog")).toBeHidden();
    await application.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      });
    }, two);
    const openedSecond = application.waitForEvent("window");
    await first.getByRole("button", { name: "Open another folder" }).click();
    const second = await openedSecond;
    await ready(second);
    await axe(second);
    await second.getByRole("button", { name: "two", exact: true }).click();
    await second.getByRole("button", { name: "one", exact: true }).click();
    expect(
      await application.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(3);
    await second.close();
    await first.getByRole("button", { name: "one", exact: true }).click();
    const reopened = application.waitForEvent("window");
    await first.getByRole("button", { name: "two", exact: true }).click();
    await ready(await reopened);
    const third = await reopened;
    await third.close();
    await rm(two, { recursive: true });
    await first.getByRole("button", { name: "one", exact: true }).click();
    await expect(first.getByText("Missing", { exact: true })).toBeVisible();
    await axe(first);
    await mkdir(join(root, "relocated"));
    await application.evaluate(
      ({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      },
      join(root, "relocated"),
    );
    const locate = first
      .getByRole("region", { name: "Recent projects" })
      .getByRole("button", { name: "Locate", exact: true });
    await expect(locate).toBeVisible();
    const [located] = await Promise.all([
      application.waitForEvent("window"),
      locate.click(),
    ]);
    await ready(located);
    const saved = JSON.parse(
      await readFile(join(root, "settings.json"), "utf8"),
    );
    expect(saved.theme).toBe(theme);
    expect(
      saved.recents.some(
        (recent: { path: string }) => recent.path === canonicalTwo,
      ),
    ).toBe(false);
    expect(
      saved.recents.some(
        (recent: { path: string }) => recent.path === canonicalOne,
      ),
    ).toBe(true);
    await page.screenshot({
      path: resolve(`../../.cache/screenshots/p02-${theme}.png`),
    });
  });
test("persisted theme is present before the first renderer document", async () => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await application.close();
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
    ),
  );
  application = await launchConfiguredApp({
    args: [resolve(".")],
    env: { ...env, VOIDRA_DATA_DIR: root },
  });
  page = await application.firstWindow();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await ready(page);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(23, 24, 32)");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.keyboard.press("Escape");
  const expected = await page.evaluate(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
});
for (const theme of ["light", "dark"] as const)
  test(`service crash, reconnect and available planning folder in ${theme}`, async () => {
    const folder = join(root, "planned");
    await mkdir(join(folder, ".voidra"), { recursive: true });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Appearance", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await page.keyboard.press("Escape");
    await application.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      });
    }, folder);
    const opened = application.waitForEvent("window");
    await page
      .getByRole("button", { name: "Open project folder", exact: true })
      .click();
    const project = await opened;
    await ready(project);
    await axe(project);
    const pid = await application.evaluate(
      ({ app }) =>
        app
          .getAppMetrics()
          .find((metric) => metric.name === "Voidra project service")?.pid,
    );
    expect(pid).toBeDefined();
    process.kill(pid as number, "SIGTERM");
    await expect(
      project.getByRole("alert", { name: "Project connection" }),
    ).toContainText("Reconnecting");
    await axe(project);
    await expect(
      project.getByRole("alert", { name: "Project connection" }),
    ).toBeHidden();
    await axe(project);
  });
