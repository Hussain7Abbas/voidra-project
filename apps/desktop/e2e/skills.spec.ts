import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`complete skill bundles protect edits and retain both installations in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-bundle-ui-")),
      home = join(temp, "home");
    await mkdir(join(home, ".claude/skills/unrelated"), { recursive: true });
    await writeFile(join(home, ".claude/skills/unrelated/keep"), "outside");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const launch = () =>
      launchConfiguredApp({
        args: [resolve(".")],
        env: {
          ...env,
          VOIDRA_DATA_DIR: join(temp, "data"),
          VOIDRA_TEST_SKILLS_HOME: home,
        },
      });
    const names = [
      "voidra-architect-general",
      "voidra-go",
      "voidra-init",
      "voidra-plan",
      "voidra-release",
      "voidra-sync",
    ];
    let app = await launch();
    try {
      const version = await app.evaluate(({ app }) => app.getVersion());
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: /^Install (Claude|Codex) Skill \d+\/6$/,
        }),
      ).toHaveCount(2);
      const skillSection = page.getByRole("region", {
        name: "Coding agent skills",
        exact: true,
      });
      await expect(skillSection.getByRole("button")).toHaveCount(2);
      for (const agent of ["Claude", "Codex"])
        await expect(
          skillSection.getByRole("button", {
            name: `Install ${agent} Skill 0/6`,
            exact: true,
          }),
        ).toBeVisible();
      await expect(skillSection).not.toContainText("bundled copies");
      await expect(
        page.getByRole("button", { name: /Install voidra-/ }),
      ).toHaveCount(0);
      for (const [agent, parent] of [
        ["Claude", ".claude"],
        ["Codex", ".agents"],
      ] as const) {
        await page
          .getByRole("button", {
            name: new RegExp(`^Install ${agent} Skill \\d+/6$`),
          })
          .click();
        await expect(
          page.getByText(
            `${agent === "Claude" ? "Claude Code" : "Codex"} skills installed`,
            { exact: true },
          ),
        ).toHaveCount(1, { timeout: 30000 });
        await expect(
          skillSection.getByRole("button", {
            name: `Install ${agent} Skill 6/6`,
            exact: true,
          }),
        ).toBeEnabled();
        for (const name of names) {
          const marker = JSON.parse(
            await readFile(
              join(home, parent, "skills", name, "voidra-skill.json"),
              "utf8",
            ),
          );
          expect(marker.version).toBe(version);
          expect(
            await readFile(
              join(home, parent, "skills", name, "SKILL.md"),
              "utf8",
            ),
          ).toContain(`name: ${name}`);
        }
      }
      const claudeParent = join(home, ".claude/skills");
      await chmod(claudeParent, 0o500);
      try {
        await page
          .getByRole("button", { name: /^Install Claude Skill \d+\/6$/ })
          .click();
        await expect(
          page
            .getByRole("dialog", { name: "Settings", exact: true })
            .getByRole("alert"),
        ).toContainText("Completed: none");
        await expect(
          page
            .getByRole("dialog", { name: "Settings", exact: true })
            .getByRole("alert"),
        ).toContainText("Remaining:");
      } finally {
        await chmod(claudeParent, 0o700);
      }
      await page
        .getByRole("button", { name: /^Install Claude Skill \d+\/6$/ })
        .click();
      await expect(
        page.getByText("Claude Code skills installed", { exact: true }),
      ).toHaveCount(1, { timeout: 30000 });
      const go = join(home, ".claude/skills/voidra-go/SKILL.md"),
        plan = join(home, ".claude/skills/voidra-plan/SKILL.md");
      const originalGo = await readFile(go, "utf8"),
        originalPlan = await readFile(plan, "utf8"),
        codexGo = await readFile(
          join(home, ".agents/skills/voidra-go/SKILL.md"),
        );
      await writeFile(go, `${originalGo}My hand edit.\n`);
      await writeFile(plan, `${originalPlan}My plan edit.\n`);
      await page
        .getByRole("button", { name: /^Install Claude Skill \d+\/6$/ })
        .click();
      await expect(
        skillSection.getByRole("button", {
          name: "Install Claude Skill 4/6",
          exact: true,
        }),
      ).toBeVisible();
      const review = page.getByRole("dialog", {
        name: "Review skill bundle",
        exact: true,
      });
      await expect(review).toContainText("My hand edit.");
      await expect(review).toContainText("My plan edit.");
      await review.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await readFile(go, "utf8")).toContain("My hand edit.");
      expect(await readFile(plan, "utf8")).toContain("My plan edit.");
      await page
        .getByRole("button", { name: /^Install Claude Skill \d+\/6$/ })
        .click();
      await expect(review).toBeVisible();
      await writeFile(plan, `${await readFile(plan, "utf8")}Later edit.\n`);
      await review
        .getByRole("button", { name: "Replace edited bundle", exact: true })
        .click();
      await expect(review.getByRole("alert")).toContainText("changed");
      await expect(review).toContainText("Later edit.");
      expect(await readFile(go, "utf8")).toContain("My hand edit.");
      await review
        .getByRole("button", { name: "Replace edited bundle", exact: true })
        .click();
      await expect(review).toBeHidden({ timeout: 30000 });
      expect(await readFile(go, "utf8")).toBe(originalGo);
      expect(await readFile(plan, "utf8")).toBe(originalPlan);
      expect(
        await readFile(join(home, ".agents/skills/voidra-go/SKILL.md")),
      ).toEqual(codexGo);
      expect(
        await readFile(join(home, ".claude/skills/unrelated/keep"), "utf8"),
      ).toBe("outside");
      await expect(
        page.getByRole("button", {
          name: /^Install Claude Skill \d+\/6$/,
        }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: /^Install Codex Skill \d+\/6$/ }),
      ).toBeEnabled();
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
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/v11-p03-skills-${theme}.png`),
      });
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(
        page.getByRole("region", { name: "Coding agent setup", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      for (const agent of ["Claude", "Codex"])
        await expect(
          page.getByRole("button", {
            name: `Install ${agent} Skill 6/6`,
            exact: true,
          }),
        ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
