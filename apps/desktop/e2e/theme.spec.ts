import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";

test("theme changes keep the complete text and background palette on every rendered frame", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-theme-frames-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
    ),
  );
  const app = await _electron.launch({
    args: [resolve(".")],
    env: { ...env, VOIDRA_DATA_DIR: root },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("light");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(document.querySelector("main h1") as Element)
              .color,
        ),
      )
      .toBe("rgb(32, 33, 50)");
    for (const theme of ["dark", "light", "dark"] as const) {
      const frames = page.evaluate(
        (target) =>
          new Promise<{ text: string; background: string }[]>(
            (resolveFrames) => {
              const seen: { text: string; background: string }[] = [];
              const sample = () => {
                if (document.documentElement.dataset.theme === target)
                  seen.push({
                    text: getComputedStyle(
                      document.querySelector("dialog footer button") as Element,
                    ).color,
                    background: getComputedStyle(
                      document.querySelector("dialog footer button") as Element,
                    ).backgroundColor,
                  });
                if (seen.length === 6) resolveFrames(seen);
                else requestAnimationFrame(sample);
              };
              requestAnimationFrame(sample);
            },
          ),
        theme,
      );
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      const expected =
        theme === "dark"
          ? { text: "rgb(238, 239, 246)", background: "rgb(34, 35, 46)" }
          : { text: "rgb(32, 33, 50)", background: "rgb(255, 255, 255)" };
      for (const sample of await frames) expect(sample).toEqual(expected);
    }
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("late board rendering uses the complete selected palette and stays reachable by keyboard", async () => {
  const { cp } = await import("node:fs/promises"),
    temp = await mkdtemp(join(tmpdir(), "voidra-theme-board-")),
    root = join(temp, "project");
  await cp(resolve("../../fixtures/busy-project/project"), root, {
    recursive: true,
  });
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
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("light");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
    await page.keyboard.press("Escape");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const target = page.getByRole("button", {
      name: "profile-change verify",
      exact: true,
    });
    await target.scrollIntoViewIfNeeded();
    const frames = await target.evaluate(
      (element) =>
        new Promise<{ color: string; background: string }[]>((resolve) => {
          const values: { color: string; background: string }[] = [];
          const sample = () => {
            values.push({
              color: getComputedStyle(element).color,
              background: getComputedStyle(
                element.closest("li.card") as Element,
              ).backgroundColor,
            });
            if (values.length === 6) resolve(values);
            else requestAnimationFrame(sample);
          };
          sample();
        }),
    );
    expect(frames).toEqual(
      Array.from({ length: 6 }, () => ({
        color: "rgb(238, 239, 246)",
        background: "rgb(34, 35, 46)",
      })),
    );
    // Tab crosses a board-row boundary using native navigation, revealing the next item.
    await target.focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      "BUTTON",
    );
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
});
