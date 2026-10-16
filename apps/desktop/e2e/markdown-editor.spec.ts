import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { checkProject } from "voidra";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`Markdown reveals only cursor/selected lines and saves source in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-editor-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
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
      await page.evaluate(() => {
        const failures: string[] = [];
        Object.assign(window, { editorPolicyFailures: failures });
        document.addEventListener("securitypolicyviolation", (event) =>
          failures.push(event.violatedDirective),
        );
      });
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await page.getByRole("radio", { name: "Normal", exact: true }).check();
      const title = page.getByLabel("Title", { exact: true }),
        editor = page.getByLabel("Description", { exact: true });
      const source =
        "# Heading\nFirst **bold** row\nSecond *italic* row\n\n- [x] Finished\n\n```ts\nconst value = 'العربية 🧭';\n```\n\n| Name | Value |\n| --- | --- |\n| Test | Safe |";
      await title.fill("Source stays intact");
      await editor.fill(source);
      await title.click();
      await expect(page.locator(".cm-md-heading")).toHaveText("Heading");
      await expect(page.locator(".cm-md-strong")).toHaveText("bold");
      await expect(page.locator(".cm-md-source")).toHaveCount(0);
      await page.locator(".cm-line").nth(1).click();
      await expect(page.locator(".cm-md-source")).toHaveCount(1);
      await expect(page.locator(".cm-md-source")).toHaveText(
        "First **bold** row",
      );
      await expect(page.locator(".cm-md-heading")).toHaveText("Heading");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowDown");
      await page.keyboard.press("Shift+ArrowDown");
      await expect(page.locator(".cm-md-source")).toHaveCount(2);
      await expect(page.locator(".cm-md-source").first()).toHaveText(
        "First **bold** row",
      );
      await expect(page.locator(".cm-md-source").last()).toHaveText(
        "Second *italic* row",
      );
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator(".cm-md-source")).toHaveCount(1);
      await title.click();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).every((button) =>
          button
            .getAnimations()
            .every((animation) => animation.playState !== "running"),
        ),
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { editorPolicyFailures: string[] })
              .editorPolicyFailures,
        ),
      ).toEqual([]);
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/v11-p02-editor-${theme}.png`),
      });
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      const checked = await checkProject(root),
        idea = [...checked.records.values()].find(
          (record) =>
            record.kind === "action" &&
            record.document.data.title === "Source stays intact",
        );
      expect(checked.diagnostics).toEqual([]);
      expect(idea?.document.body.trimEnd()).toBe(source);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
