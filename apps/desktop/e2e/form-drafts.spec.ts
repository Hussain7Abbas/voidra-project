import { once } from "node:events";
import { chmod, cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const)
  test(`capture retains invalid Normal and Agentic drafts through native close and restart in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-capture-drafts-")),
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
      _electron.launch({
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: data },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance" }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      let dialog = page.getByRole("dialog", {
        name: "Create action",
        exact: true,
      });
      await expect(
        dialog.getByRole("radio", { name: "Agentic", exact: true }),
      ).toBeChecked();
      await expect(
        dialog.getByText("Who does the work?", { exact: true }),
      ).toHaveCount(0);
      await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Unfinished first");
      await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill("# 私的\n\n**العربية** 🧭");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await expect(
        dialog.getByRole("radio", { name: "Agentic", exact: true }),
      ).toBeChecked();
      await dialog
        .getByRole("textbox", { name: "Task", exact: true })
        .fill("Second unfinished prompt");
      await dialog
        .getByRole("button", { name: /Restore draft 1: Unfinished first/ })
        .click();
      await expect(
        dialog.getByRole("radio", { name: "Normal", exact: true }),
      ).toBeChecked();
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
        "Unfinished first",
      );
      await expect(
        dialog.getByRole("textbox", { name: "Description", exact: true }),
      ).toContainText("العربية");
      await dialog.getByLabel("Title", { exact: true }).fill("");
      await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill("");
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.close(),
      );
      if (app.process().exitCode === null) await once(app.process(), "exit");
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      dialog = page.getByRole("dialog", { name: "Create action", exact: true });
      await expect(
        dialog.getByRole("button", { name: /Restore draft/ }),
      ).toHaveCount(2);
      await dialog
        .getByRole("button", {
          name: /Restore draft .*Second unfinished prompt/,
        })
        .click();
      await expect(
        dialog.getByRole("textbox", { name: "Task", exact: true }),
      ).toContainText("Second unfinished prompt");
      await dialog
        .getByRole("button", { name: "Discard current draft", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: /Restore draft/ }),
      ).toHaveCount(1);
      await dialog.getByRole("button", { name: /Restore draft/ }).click();
      await expect(
        dialog.getByRole("radio", { name: "Normal", exact: true }),
      ).toBeChecked();
      await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("");
      await dialog
        .getByLabel("Title", { exact: true })
        .fill("Saved manual title");
      await dialog
        .getByRole("textbox", { name: "Description", exact: true })
        .fill("**Manual** description");
      await dialog
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(dialog).toBeHidden({ timeout: 30000 });
      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await expect(
        dialog.getByRole("radio", { name: "Agentic", exact: true }),
      ).toBeChecked();
      await expect(
        dialog.getByRole("button", { name: /Restore draft/ }),
      ).toHaveCount(0);
      expect(
        (await new AxeBuilder({ page }).setLegacyMode().analyze()).violations,
      ).toEqual([]);
      const files = await readdir(join(data, "form-drafts"), {
        recursive: true,
      });
      expect(files.filter((file) => file.endsWith(".json"))).toEqual([]);
      const actions = await readdir(join(root, ".voidra/actions"));
      expect(actions.length).toBeGreaterThan(0);
      const serialized = await Promise.all(
        actions.map((id) =>
          readFile(join(root, ".voidra/actions", id, "action.md"), "utf8"),
        ),
      );
      expect(
        serialized.filter((raw) => raw.includes("Saved manual title")),
      ).toHaveLength(1);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });

test("a real draft-storage failure keeps capture open and retry preserves the latest input", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-draft-io-")),
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
  const app = await _electron.launch({
    args: [resolve("."), `--project=${root}`],
    env: { ...env, VOIDRA_DATA_DIR: data },
  });
  let folder = "";
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await page.getByRole("button", { name: "New action", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Create action",
      exact: true,
    });
    await dialog.getByRole("radio", { name: "Normal", exact: true }).check();
    await dialog
      .getByLabel("Title", { exact: true })
      .fill("Storage failure case");
    await dialog
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Original text");
    await expect(
      dialog.getByRole("button", {
        name: /Restore draft .*Storage failure case/,
      }),
    ).toBeVisible();
    const file = (
      await readdir(join(data, "form-drafts"), { recursive: true })
    ).find((file) => file.endsWith(".json"));
    if (!file) throw Error("Missing draft file");
    folder = dirname(join(data, "form-drafts", file));
    await chmod(folder, 0o500);
    await dialog
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Latest **recoverable** text");
    await expect(dialog).toContainText("draft could not be saved");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "Description", exact: true }),
    ).toContainText("Latest");
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.focus();
      const item = Menu.getApplicationMenu()
        ?.items.flatMap((item) => item.submenu?.items ?? [])
        .find((item) => item.label === "Settings…");
      if (!item) throw Error("Missing native Settings command");
      item.click(item, window, window?.webContents);
    });
    const settings = page.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await expect(settings).toBeHidden();
    await expect(dialog).toBeVisible();
    await chmod(folder, 0o700);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "New action", exact: true }).click();
    await dialog
      .getByRole("button", { name: /Restore draft .*Storage failure case/ })
      .click();
    await expect(
      dialog.getByRole("radio", { name: "Normal", exact: true }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("textbox", { name: "Description", exact: true }),
    ).toContainText("recoverable");
  } finally {
    if (folder) await chmod(folder, 0o700);
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
