import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

test("renders and accepts keyboard input without showing or focusing a native window", async () => {
  test.skip(
    process.env.VOIDRA_TEST_BACKGROUND !== "1",
    "This check verifies background mode",
  );
  const root = await mkdtemp(join(tmpdir(), "voidra-background-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
    ),
  );
  const application = await launchConfiguredApp({
    args: [resolve(".")],
    env: { ...env, VOIDRA_DATA_DIR: root },
  });
  try {
    const page = await application.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const nativeState = () =>
      application.evaluate(({ BrowserWindow, app }) => ({
        windows: BrowserWindow.getAllWindows().map((window) => ({
          visible: window.isVisible(),
          focused: window.isFocused(),
        })),
        dock: app.dock?.isVisible() ?? false,
      }));
    expect(await nativeState()).toEqual({
      windows: [{ visible: false, focused: false }],
      dock: false,
    });
    await application.evaluate(({ Menu, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const settings = Menu.getApplicationMenu()
        ?.items.flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.label === "Settings…");
      if (!settings) throw Error("Missing native Settings command");
      settings.click(settings, window, window?.webContents);
    });
    await page.getByRole("tab", { name: "Team", exact: true }).click();
    const name = page.getByLabel("Member name", { exact: true });
    await name.fill("Background member");
    await name.press("End");
    await name.press("!");
    await expect(name).toHaveValue("Background member!");
    expect(
      await page.evaluate(
        () =>
          new Promise<boolean>((resolve) =>
            requestAnimationFrame(() => resolve(true)),
          ),
      ),
    ).toBe(true);
    expect((await page.screenshot()).byteLength).toBeGreaterThan(1000);
    expect(await nativeState()).toEqual({
      windows: [{ visible: false, focused: false }],
      dock: false,
    });
  } finally {
    await application.close();
    await rm(root, { recursive: true, force: true });
  }
});
