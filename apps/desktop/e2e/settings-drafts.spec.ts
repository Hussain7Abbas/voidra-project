import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { checkProject } from "voidra";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`Team and agent preference drafts restore without applying settings in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-settings-drafts-")),
      root = join(temp, "project"),
      data = join(temp, "data");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
      ),
    );
    const launch = () =>
      launchConfiguredApp({
        args: [resolve("."), `--project=${root}`, "--use-mock-keychain"],
        env: {
          ...env,
          VOIDRA_DATA_DIR: data,
        },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance" }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "Team" }).click();
      await page
        .getByLabel("Member name", { exact: true })
        .fill("Unfinished member");
      await page.getByLabel("Member email", { exact: true }).fill("partial@");
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Settings", exact: true }),
      ).toBeHidden();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Team" }).click();
      await page
        .getByRole("button", { name: /Restore draft .*Unfinished member/ })
        .click();
      await expect(
        page.getByLabel("Member email", { exact: true }),
      ).toHaveValue("partial@");
      await expect(
        page
          .getByRole("region", { name: "Team members", exact: true })
          .getByRole("button", { name: /Remove/ }),
      ).toHaveCount(0);
      await page
        .getByLabel("Member email", { exact: true })
        .fill("member@example.test");
      await page
        .getByRole("button", { name: "Add team member", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Remove Unfinished member from Team",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Restore draft/ }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      const bootstrap = [...(await checkProject(root)).records.values()].find(
        (record) =>
          record.kind === "action" &&
          record.document.data.title === "Bootstrap",
      );
      if (!bootstrap) throw Error("Missing Bootstrap fixture");
      await page
        .getByRole("button", { name: "Bootstrap", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit description", exact: true })
        .click();
      await page.getByLabel("Description", { exact: true }).focus();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText("Recover **removed** task description");
      await page.keyboard.press("Escape");
      await rm(
        join(root, ".voidra/actions", String(bootstrap.document.data.id)),
        { recursive: true },
      );
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByText("Unfinished forms", { exact: true }).click();
      await page
        .getByRole("button", { name: /Read unfinished form .*Recover/ })
        .click();
      await expect(
        page.getByRole("region", { name: "Recovered form text", exact: true }),
      ).toContainText("Recover removed task description");
      await page
        .getByRole("button", { name: "Copy Markdown", exact: true })
        .click();
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        "Recover **removed** task description",
      );
      await page
        .getByRole("button", { name: "Discard this draft", exact: true })
        .click();
      await expect(
        page.getByText("No unfinished forms in this project.", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("AI model", { exact: true }).fill("custom-model");
      await page.getByLabel("AI effort", { exact: true }).selectOption("high");
      await page.keyboard.press("Escape");
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: /Restore draft/ }).click();
      await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
        "custom-model",
      );
      await page
        .getByRole("button", { name: "Save AI preferences", exact: true })
        .click();
      await expect(
        page.getByText("AI preferences saved", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("radio", { name: "Claude Code", exact: true })
        .check();
      await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
        "",
      );
      await page.getByLabel("AI model", { exact: true }).fill("haiku");
      await page
        .getByRole("button", { name: "Save AI preferences", exact: true })
        .click();
      await expect(
        page.getByText("AI preferences saved", { exact: true }),
      ).toBeVisible();
      await page.getByRole("radio", { name: "Codex", exact: true }).check();
      await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
        "custom-model",
      );
      await expect(page.getByLabel("AI effort", { exact: true })).toHaveValue(
        "high",
      );
      await page
        .getByRole("button", { name: "Test agent connection", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(`../../.cache/ai-settings-${theme}.png`),
      });
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
