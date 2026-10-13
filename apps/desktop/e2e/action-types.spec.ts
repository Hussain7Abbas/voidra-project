import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, lifecycles } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`creates every action type and a human checklist in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-types-")),
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
    const app = await _electron.launch({
      args: [resolve("."), `--project=${root}`],
      env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      for (const type of Object.keys(lifecycles)) {
        await page
          .getByRole("button", { name: "New action", exact: true })
          .click();
        await page
          .getByLabel("Action type", { exact: true })
          .selectOption(type);
        await page.getByLabel("Title", { exact: true }).fill(`Test ${type}`);
        await page
          .getByLabel("Description", { exact: true })
          .fill("One visible outcome with a clear verification step.");
        await page
          .getByRole("button", { name: "Create action", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(
          page.getByRole("button", { name: `Test ${type}`, exact: true }),
        ).toBeVisible();
      }
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await page.getByRole("radio", { name: "You", exact: true }).check();
      await page
        .getByLabel("Title", { exact: true })
        .fill("Create provider account");
      await page
        .getByLabel("Description", { exact: true })
        .fill("Use your own provider account.");
      await page
        .getByLabel("Steps", { exact: true })
        .fill("Create account\nConfirm access");
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).every((b) =>
          b.getAnimations().every((a) => a.playState !== "running"),
        ),
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden();
      const result = await checkProject(root);
      expect(result.diagnostics).toEqual([]);
      const human = [...result.records.values()].find(
        (r) => r.kind === "action" && r.document.data.doneBy === "you",
      );
      expect(human?.document.data.steps).toHaveLength(2);
      expect(human?.document.data.stage).toBeUndefined();
      await page
        .getByRole("button", { name: "Create provider account", exact: true })
        .click();
      await page
        .getByRole("checkbox", { name: "Create account", exact: true })
        .check();
      await expect
        .poll(
          async () =>
            [...(await checkProject(root)).records.values()].find(
              (r) =>
                r.kind === "action" &&
                r.document.data.title === "Create provider account",
            )?.document.data.steps,
        )
        .toEqual([
          { id: "step-1", title: "Create account", done: true },
          { id: "step-2", title: "Confirm access", done: false },
        ]);
      await page
        .getByRole("checkbox", { name: "Confirm access", exact: true })
        .check();
      await expect
        .poll(
          async () =>
            [...(await checkProject(root)).records.values()].find(
              (r) =>
                r.kind === "action" &&
                r.document.data.title === "Create provider account",
            )?.document.data.status,
        )
        .toBe("complete");
      await page
        .getByRole("button", { name: "Back to actions", exact: true })
        .click();
      await page.getByLabel("Type", { exact: true }).selectOption("bug");
      await expect(
        page.getByRole("button", { name: "Test bug", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Test feature", exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Done by", { exact: true }).selectOption("you");
      await expect(
        page.getByRole("button", { name: "Test bug", exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Type", { exact: true }).selectOption("all");
      await expect(
        page.getByRole("button", {
          name: "Create provider account",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
