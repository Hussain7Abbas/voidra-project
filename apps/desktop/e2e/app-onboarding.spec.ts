import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";

for (const [theme, client, name, parent] of [
  ["light", "codex", "Codex", ".agents"],
  ["dark", "claude-code", "Claude", ".claude"],
] as const) {
  test(`first launch saves setup and verifies ${name} skills in ${theme}`, async () => {
    test.setTimeout(120000);
    const root = await mkdtemp(join(tmpdir(), "voidra-app-setup-")),
      data = join(root, "data"),
      home = join(root, "home");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
      ),
    );
    const launch = () =>
      _electron.launch({
        args: [resolve(".")],
        env: { ...env, VOIDRA_DATA_DIR: data, VOIDRA_TEST_SKILLS_HOME: home },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await expect(
        page.getByRole("heading", { name: "Make Voidra yours." }),
      ).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "Project navigation" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Continue to Voidra" }),
      ).toBeDisabled();
      const premature = await page.evaluate(() =>
        window.voidra.invoke({
          command: "complete-setup",
          client: "codex",
          theme: "system",
        }),
      );
      expect(premature.ok).toBe(false);
      await page
        .getByRole("radio", {
          name: theme === "light" ? "Light" : "Dark",
          exact: true,
        })
        .check();
      await expect(
        page.getByRole("radio", { name: "System", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("radio", {
          name: client === "codex" ? "Codex" : "Claude Code",
          exact: true,
        })
        .check();
      await expect(
        page.getByRole("radio", { name: "System", exact: true }),
      ).toBeEnabled();
      await page
        .getByLabel("AI model", { exact: true })
        .fill(client === "codex" ? "custom-codex" : "haiku");
      await page.getByLabel("AI effort", { exact: true }).selectOption("high");
      await page
        .getByRole("button", { name: "Save AI preferences", exact: true })
        .click();
      await expect(
        page.getByText("AI preferences saved", { exact: true }),
      ).toBeVisible();
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await expect(
        page.getByRole("radio", {
          name: theme === "light" ? "Light" : "Dark",
          exact: true,
        }),
      ).toBeChecked();
      await expect(
        page.getByRole("radio", {
          name: client === "codex" ? "Codex" : "Claude Code",
          exact: true,
        }),
      ).toBeChecked();
      await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
        client === "codex" ? "custom-codex" : "haiku",
      );
      await expect(page.getByLabel("AI effort", { exact: true })).toHaveValue(
        "high",
      );
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(
        page.getByRole("button", { name: /^Install .* Skill/ }),
      ).toHaveCount(1);
      await page
        .getByRole("button", { name: `Install ${name} Skill 0/6`, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Continue to Voidra" }),
      ).toBeEnabled({ timeout: 30000 });
      const skill = join(home, parent, "skills/voidra-go/SKILL.md");
      const original = await readFile(skill, "utf8");
      await expect(
        access(
          join(
            home,
            parent === ".agents" ? ".claude" : ".agents",
            "skills/voidra-go",
          ),
        ),
      ).rejects.toThrow();
      // A filesystem edit after the displayed ready state must be caught by main.
      await writeFile(skill, `${original}\nMy preserved setup edit.\n`);
      await page.getByRole("button", { name: "Continue to Voidra" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Install the complete skills",
      );
      expect(
        JSON.parse(await readFile(join(data, "settings.json"), "utf8"))
          .setupCompleted,
      ).toBe(false);
      await page
        .getByRole("button", { name: new RegExp(`^Install ${name} Skill`) })
        .click();
      const review = page.getByRole("dialog", { name: "Review skill bundle" });
      await expect(review).toContainText("My preserved setup edit.");
      await review.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(review).toBeHidden();
      expect(await readFile(skill, "utf8")).toContain(
        "My preserved setup edit.",
      );
      await expect(
        page.getByRole("button", { name: "Continue to Voidra" }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: new RegExp(`^Install ${name} Skill`) })
        .click();
      await review
        .getByRole("button", { name: "Replace edited bundle", exact: true })
        .click();
      await expect(review).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByRole("button", { name: "Continue to Voidra" }),
      ).toBeEnabled({ timeout: 30000 });
      expect(await readFile(skill, "utf8")).toBe(original);
      // Switching agents requires the newly selected bundle, while retaining the first one.
      const otherClient = client === "codex" ? "Claude Code" : "Codex";
      await page.getByRole("radio", { name: otherClient, exact: true }).click();
      await expect(
        page.getByRole("radio", { name: "System", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Continue to Voidra" }),
      ).toBeDisabled();
      await page
        .getByRole("radio", {
          name: client === "codex" ? "Codex" : "Claude Code",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Continue to Voidra" }),
      ).toBeEnabled();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode().analyze()).violations,
      ).toEqual([]);
      await page.locator(".setup-scroll").evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: resolve(`../../.cache/onboarding-${theme}-full.png`),
      });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setSize(700, 550),
      );
      await page
        .getByRole("button", { name: "Continue to Voidra" })
        .scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: resolve(`../../.cache/onboarding-${theme}.png`),
      });
      await page.getByRole("button", { name: "Continue to Voidra" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("complementary", { name: "Project navigation" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Make Voidra yours." }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
        client === "codex" ? "custom-codex" : "haiku",
      );
      await expect(page.getByLabel("AI effort", { exact: true })).toHaveValue(
        "high",
      );
      await expect(
        page.getByRole("button", { name: "Save AI preferences", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      // The shell host survives setup so the existing ResizeObserver stays attached.
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setSize(1000, 700),
      );
      const divider = page.getByRole("separator", {
        name: "Resize Project navigation",
        exact: true,
      });
      await expect(divider).toBeVisible();
      await divider.focus();
      await page.keyboard.press("End");
      await expect
        .poll(() =>
          page
            .getByRole("complementary", { name: "Project navigation" })
            .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeGreaterThan(350);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setSize(700, 550),
      );
      await expect
        .poll(() =>
          page
            .getByRole("complementary", { name: "Project navigation" })
            .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeLessThan(300);

      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await expect(
        page.getByRole("complementary", { name: "Project navigation" }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });
}

test("first-run installation can recover from a blocked destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-setup-retry-")),
    home = join(root, "home"),
    outside = join(root, "outside");
  await mkdir(home);
  await mkdir(outside);
  await symlink(outside, join(home, ".agents"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
    ),
  );
  const app = await _electron.launch({
    args: [resolve(".")],
    env: {
      ...env,
      VOIDRA_DATA_DIR: join(root, "data"),
      VOIDRA_TEST_SKILLS_HOME: home,
    },
  });
  try {
    const page = await app.firstWindow();
    const install = page.getByRole("button", { name: /^Install Codex Skill/ });
    await expect(install).toBeEnabled();
    await install.click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue to Voidra" }),
    ).toBeDisabled();
    await rm(join(home, ".agents"));
    await install.click();
    await expect(
      page.getByRole("button", { name: "Continue to Voidra" }),
    ).toBeEnabled({ timeout: 30000 });
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
