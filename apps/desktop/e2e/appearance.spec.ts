import { mkdtemp, readFile, rm } from "node:fs/promises";
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
async function launch() {
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
  await page.locator('[data-app-ready="true"]').waitFor();
  // A hosted macOS display can be smaller than the default 1200×800 window.
  // Establish a real normal window before testing maximize/restore labels.
  await application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Expected the app window");
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    window.unmaximize();
    window.setBounds({
      x: area.x + 40,
      y: area.y + 40,
      width: Math.min(1000, area.width - 80),
      height: Math.min(700, area.height - 80),
    });
    if (process.env.VOIDRA_TEST_BACKGROUND !== "1") window.focus();
  });
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isMaximized(),
      ),
    )
    .toBe(false);
  // Refresh the renderer's initial snapshot after native test setup. No app
  // preference or production event is changed to force the expected label.
  await page.reload();
  await page.locator('[data-app-ready="true"]').waitFor();
}
async function assertTitlebarLayout(selector: string) {
  const metrics = await page.locator(selector).evaluate((bar) => {
    const box = bar.getBoundingClientRect();
    const title = bar.querySelector(".window-title")?.getBoundingClientRect();
    const tools = bar.querySelector(".window-tools");
    const controls = bar
      .querySelector(".window-controls")
      ?.getBoundingClientRect();
    const buttons = [...(tools?.querySelectorAll("button") ?? [])];
    return {
      center: title
        ? Math.abs(title.x + title.width / 2 - box.x - box.width / 2)
        : Infinity,
      toolNames: buttons.map((button) => button.getAttribute("aria-label")),
      opposite:
        !controls ||
        controls.right <= (tools?.getBoundingClientRect().left ?? 0),
      reachable: buttons
        .filter((button) => !button.disabled)
        .every((button) => {
          const rect = button.getBoundingClientRect();
          return (
            document
              .elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              )
              ?.closest("button") === button
          );
        }),
    };
  });
  expect(metrics.center).toBeLessThan(0.5);
  expect(metrics.opposite).toBe(true);
  expect(metrics.reachable).toBe(true);
  expect(metrics.toolNames).toEqual([
    "Navigation",
    "Actions",
    "Waiting for you",
    "Undo",
    "Redo",
    "Settings",
  ]);
}
async function audit() {
  expect(
    (await new AxeBuilder({ page }).setLegacyMode(true).analyze()).violations,
  ).toEqual([]);
}
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "voidra-appearance-"));
  await launch();
});
test.afterEach(async () => {
  const info = test.info();
  if (info.status !== info.expectedStatus) {
    const geometry = await application
      .evaluate(({ BrowserWindow, screen }) =>
        BrowserWindow.getAllWindows().map((window) => ({
          bounds: window.getBounds(),
          workArea: screen.getDisplayMatching(window.getBounds()).workArea,
          maximized: window.isMaximized(),
          fullscreen: window.isFullScreen(),
          minimized: window.isMinimized(),
        })),
      )
      .catch(() => null);
    console.error("Appearance-test native window state:", geometry);
  }
  await application?.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
});
for (const theme of ["light", "dark"] as const) {
  test(`independent overflow, settings keyboard tabs and real custom/native titlebars in ${theme}`, async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const general = page.getByRole("tab", { name: "General", exact: true });
    const appearance = page.getByRole("tab", {
      name: "Appearance",
      exact: true,
    });
    await expect(general).toHaveAttribute("aria-selected", "true");
    await general.focus();
    await page.keyboard.press("ArrowRight");
    await expect(appearance).toBeFocused();
    await expect(appearance).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    const toggle = page.getByRole("switch", { name: "Custom titlebar" });
    await expect(toggle).toBeChecked();
    await audit();
    await appearance.focus();
    await page.keyboard.press("Home");
    await expect(general).toBeFocused();
    await expect(toggle).toBeHidden();
    await audit();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tab", { name: "Team", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(appearance).toBeFocused();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(
      page.getByText("Reopen this window to apply your titlebar preference."),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(join(root, "settings.json"), "utf8"))
            .customTitlebar,
      )
      .toBe(false);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeFocused();
    await expect(page.locator(".window-titlebar")).toBeVisible();
    await assertTitlebarLayout(".window-titlebar");
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ width: 700, height: 600 });
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(700);
    await page.locator(".window-title").evaluate((title) => {
      title.textContent =
        "A very long project title that stays centered beneath the titlebar buttons";
    });
    await assertTitlebarLayout(".window-titlebar");
    await page.screenshot({
      path: resolve(`../../.cache/screenshots/titlebar-narrow-${theme}.png`),
    });

    const positions = await page
      .locator(".window-titlebar")
      .evaluate((element) => {
        const controls = element
          .querySelector(".window-controls")
          ?.getBoundingClientRect();
        const settings = element
          .querySelector('[aria-label="Settings"]')
          ?.getBoundingClientRect();
        return { controls: controls?.x ?? 0, settings: settings?.x ?? 0 };
      });
    expect(positions.controls).toBeLessThan(positions.settings);
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ width: 1000, height: 550 });
    });
    // The reduced navigation fits at normal size; real magnification exercises
    // independent overflow without adding obsolete navigation entries.
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5);
    });
    const metrics = () =>
      page.evaluate(() => {
        const sidebar = document.querySelector<HTMLElement>(".sidebar");
        const main = document.querySelector<HTMLElement>(".main-content");
        if (!sidebar || !main) throw new Error("Missing scroll regions");
        return {
          sidebar: sidebar.scrollTop,
          main: main.scrollTop,
          sidebarOverflow: sidebar.scrollHeight > sidebar.clientHeight,
          mainOverflow: main.scrollHeight > main.clientHeight,
          sidebarStyle: getComputedStyle(sidebar).overflowY,
          mainStyle: getComputedStyle(main).overflowY,
          pageOverflow: document.documentElement.scrollHeight > innerHeight,
        };
      });
    await expect.poll(async () => (await metrics()).sidebarOverflow).toBe(true);
    await expect.poll(async () => (await metrics()).mainOverflow).toBe(true);
    expect(await metrics()).toMatchObject({
      sidebarStyle: "auto",
      mainStyle: "auto",
      pageOverflow: false,
    });
    await page.locator(".sidebar").hover();
    await page.mouse.wheel(0, 1000);
    await expect.poll(async () => (await metrics()).sidebar).toBeGreaterThan(0);
    expect((await metrics()).main).toBe(0);
    const sidebarPosition = (await metrics()).sidebar;
    await page.locator(".main-content").hover();
    await page.mouse.wheel(0, 1000);
    await expect.poll(async () => (await metrics()).main).toBeGreaterThan(0);
    expect((await metrics()).sidebar).toBe(sidebarPosition);
    await audit();
    await page.screenshot({
      path: resolve(`../../.cache/screenshots/titlebar-${theme}.png`),
    });
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
    });

    await application.close();
    await launch();
    await expect(page.locator(".window-titlebar")).toHaveCount(0);
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ width: 700, height: 600 });
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(700);
    await assertTitlebarLayout(".native-titlebar-accessory");

    expect(
      await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return window
          ? window.getBounds().height - window.getContentBounds().height
          : 0;
      }),
    ).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Appearance", exact: true }).click();
    const nativeToggle = page.getByRole("switch", { name: "Custom titlebar" });
    await expect(nativeToggle).not.toBeChecked();
    await nativeToggle.check();
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(join(root, "settings.json"), "utf8"))
            .customTitlebar,
      )
      .toBe(true);
    await application.close();
    await launch();
    await expect(page.locator(".window-titlebar")).toBeVisible();
    const closed = application.waitForEvent("close");
    await page.getByRole("button", { name: "Close window" }).click();
    await closed;
  });
}

test.describe("Visible native window controls", () => {
  test.skip(
    process.env.VOIDRA_TEST_BACKGROUND === "1",
    "Native minimize/maximize requires visible windows: VOIDRA_TEST_BACKGROUND=0 make e2e",
  );
  for (const theme of ["light", "dark"] as const)
    test(`maximizes, restores and minimizes the native window in ${theme}`, async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Maximize window" }).click();
      await expect
        .poll(() =>
          application.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.isMaximized(),
          ),
        )
        .toBe(true);
      await page.getByRole("button", { name: "Restore window" }).click();
      await expect
        .poll(() =>
          application.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.isMaximized(),
          ),
        )
        .toBe(false);
      await page.getByRole("button", { name: "Minimize window" }).click();
      await expect
        .poll(() =>
          application.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.isMinimized(),
          ),
        )
        .toBe(true);
      await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window?.restore();
        window?.setBounds({ width: 1000, height: 550 });
        window?.focus();
      });
    });
});
