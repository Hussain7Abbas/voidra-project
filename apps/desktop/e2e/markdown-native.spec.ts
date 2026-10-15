import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { checkProject } from "voidra";

test("Markdown clipboard, native-menu history, IME and Unicode retain source independently of project undo", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-editor-native-")),
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
    await page.getByRole("button", { name: "Backlog", exact: true }).click();
    await page.getByRole("button", { name: "New idea", exact: true }).click();
    await page.getByRole("radio", { name: "Normal", exact: true }).check();
    await page.getByLabel("Title", { exact: true }).fill("Native editing");
    const editor = page.getByLabel("Description", { exact: true });
    await editor.fill("# Original\n**العربية** 🧭");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      "# Original\n**العربية** 🧭",
    );
    const pasted = "# Pasted\r\nNext **row** 🧭";
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      pasted,
    );
    await page.keyboard.press("ControlOrMeta+v");
    await expect(editor).toContainText("Pasted");
    // Invoke the real application's native menu, which must route to local editor history.
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const edit = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "Edit",
      );
      const undo = edit?.submenu?.items.find((item) =>
        item.label.startsWith("Undo"),
      );
      if (!undo?.click) throw Error("Missing Undo menu");
      undo.click(
        undo,
        BrowserWindow.getAllWindows()[0],
        BrowserWindow.getAllWindows()[0]?.webContents,
      );
    });
    await expect(editor).toContainText("Original");
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const edit = Menu.getApplicationMenu()?.items.find(
        (item) => item.label === "Edit",
      );
      const redo = edit?.submenu?.items.find((item) =>
        item.label.startsWith("Redo"),
      );
      if (!redo?.click) throw Error("Missing Redo menu");
      redo.click(
        redo,
        BrowserWindow.getAllWindows()[0],
        BrowserWindow.getAllWindows()[0]?.webContents,
      );
    });
    await expect(editor).toContainText("Pasted");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+x");
    await expect(editor.locator(".cm-placeholder")).toBeVisible();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(pasted);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "Enter a description.",
    );
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).toContainText("Pasted");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(editor.locator(".cm-placeholder")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+v");
    await page.keyboard.press("ControlOrMeta+End");
    const session = await page.context().newCDPSession(page);
    await session.send("Input.imeSetComposition", {
      text: "日本",
      selectionStart: 2,
      selectionEnd: 2,
    });
    await session.send("Input.insertText", { text: "日本語" });
    await session.detach();
    await expect(editor).toContainText("日本語");
    expect(
      [...(await checkProject(root)).records.values()].filter(
        (record) => record.kind === "idea",
      ),
    ).toHaveLength(0);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
    const checked = await checkProject(root),
      idea = [...checked.records.values()].find(
        (record) => record.kind === "idea",
      );
    expect(checked.diagnostics).toEqual([]);
    expect(idea?.document.body.trimEnd()).toBe(`${pasted}日本語`);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
});
