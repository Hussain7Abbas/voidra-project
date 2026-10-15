import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`Team, project membership and Me survive restart in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-team-ui-")),
      root = join(temp, "one"),
      other = join(temp, "two");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await cp(root, other, { recursive: true });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (p): p is [string, string] =>
          p[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
      ),
    );
    const launch = () =>
      _electron.launch({
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).focus();
      await page.keyboard.press("End");
      await expect(
        page.getByRole("tab", { name: "Team", exact: true }),
      ).toBeFocused();
      await page.getByLabel("Member name", { exact: true }).fill("Ada");
      await page
        .getByLabel("Member email", { exact: true })
        .fill("ada@example.test");
      await page
        .getByRole("button", { name: "Add team member", exact: true })
        .click();
      await expect(
        page.getByRole("checkbox", {
          name: "Ada · ada@example.test",
          exact: true,
        }),
      ).toBeChecked();
      await page
        .getByLabel("Me", { exact: true })
        .selectOption({ label: "Ada · ada@example.test" });
      await expect(
        page.getByRole("checkbox", {
          name: "Ada · ada@example.test (Me)",
          exact: true,
        }),
      ).toBeChecked();
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
        path: resolve(`../../.cache/screenshots/v11-p03-team-${theme}.png`),
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Create action", exact: true })
          .getByLabel("Assignee", { exact: true }),
      ).toHaveValue("Ada <ada@example.test>");
      await page
        .getByLabel("Action type", { exact: true })
        .selectOption("docs");
      await page
        .getByLabel("Title", { exact: true })
        .fill("Assigned documentation");
      await page
        .getByLabel("Description", { exact: true })
        .fill("Keep the portable assignment.");
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Create action", exact: true })
          .getByLabel("Assignee", { exact: true }),
      ).toHaveValue("Ada <ada@example.test>");
      await page.keyboard.press("Escape");
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, other);
      const opened = app.waitForEvent("window");
      await page.getByRole("button", { name: "one", exact: true }).click();
      await page
        .getByRole("button", { name: "Open another folder", exact: true })
        .click();
      const second = await opened;
      await second.locator('[data-app-ready="true"]').waitFor();
      await second
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await expect(
        second
          .getByRole("dialog", { name: "Create action", exact: true })
          .getByLabel("Assignee", { exact: true }),
      ).toHaveValue("");
      await expect(
        second
          .getByRole("dialog", { name: "Create action", exact: true })
          .getByLabel("Assignee", { exact: true })
          .locator("option"),
      ).toHaveCount(1);
      await page.bringToFront();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Team", exact: true }).click();
      await page
        .getByRole("button", { name: "Remove Ada from Team", exact: true })
        .click();
      await expect(page.getByLabel("Me", { exact: true })).toHaveValue("");
      const checked = await checkProject(root);
      expect(checked.diagnostics).toEqual([]);
      expect(
        [...checked.records.values()].find(
          (record) =>
            record.kind === "action" &&
            record.document.data.title === "Assigned documentation",
        )?.document.data.assignee,
      ).toBe("Ada <ada@example.test>");
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
