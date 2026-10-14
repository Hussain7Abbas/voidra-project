import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const)
  test(`skill installation protects edits and offers setup once in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-skills-ui-")),
      home = join(temp, "home");
    await mkdir(home);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const launch = () =>
      _electron.launch({
        args: [resolve(".")],
        env: {
          ...env,
          VOIDRA_DATA_DIR: join(temp, "data"),
          VOIDRA_TEST_SKILLS_HOME: home,
        },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(
        page.getByRole("region", { name: "Coding agent setup", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Review skill installation", exact: true })
        .click();
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.getByText("Coding agent skills", { exact: true }).click();
      await page
        .getByRole("button", {
          name: "Install voidra-go for Claude Code",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("article", {
          name: "Claude Code voidra-go",
          exact: true,
        }),
      ).toContainText("Installed 0.2.0");
      await page
        .getByRole("button", {
          name: "Install voidra-go for Codex",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("article", { name: "Codex voidra-go", exact: true }),
      ).toContainText("Installed 0.2.0");
      const path = join(home, ".claude/skills/voidra-go/SKILL.md");
      await writeFile(path, `${await readFile(path, "utf8")}My hand edit.\n`);
      await page
        .getByRole("button", { name: "Refresh skill status", exact: true })
        .click();
      await expect(
        page.getByRole("article", {
          name: "Claude Code voidra-go",
          exact: true,
        }),
      ).toContainText("Edited locally");
      await page
        .getByRole("button", {
          name: "Update voidra-go for Claude Code",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Review skill changes",
        exact: true,
      });
      await expect(dialog).toContainText("My hand edit.");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await readFile(path, "utf8")).toContain("My hand edit.");
      await page
        .getByRole("button", {
          name: "Update voidra-go for Claude Code",
          exact: true,
        })
        .click();
      await dialog
        .getByRole("button", { name: "Replace edited copy", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      expect(await readFile(path, "utf8")).not.toContain("My hand edit.");
      await page
        .getByRole("button", {
          name: "Remove voidra-go for Claude Code",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("article", {
          name: "Claude Code voidra-go",
          exact: true,
        }),
      ).toContainText("Not installed");
      expect(
        await readFile(join(home, ".agents/skills/voidra-go/SKILL.md"), "utf8"),
      ).toContain("name: voidra-go");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(
        page.getByRole("region", { name: "Coding agent setup", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByText("Coding agent skills", { exact: true }).click();
      await expect(
        page.getByRole("article", { name: "Codex voidra-go", exact: true }),
      ).toContainText("Installed 0.2.0");
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
