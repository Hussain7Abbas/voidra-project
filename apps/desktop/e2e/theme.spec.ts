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
