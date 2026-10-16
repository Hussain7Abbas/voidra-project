import { once } from "node:events";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`keeps compact documentation focus and directory preferences in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-doc-layout-")),
      root = join(temp, "project"),
      data = join(temp, "data");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await mkdir(join(root, "docs"));
    await mkdir(data);
    await writeFile(
      join(data, "settings.json"),
      JSON.stringify({ version: 1, theme, recents: [], skillsOfferSeen: true }),
    );
    await writeFile(
      join(root, "docs/unicode.md"),
      "# Unicode\n\nΟΣ ος οσ İ🙂\n",
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
      ),
    );
    const launch = () =>
      launchConfiguredApp({
        args: [resolve("."), `--project=${root}`],
        env: { ...env, VOIDRA_DATA_DIR: data },
      });
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setBounds({
          width: 800,
          height: 600,
        }),
      );
      await page
        .getByRole("button", { name: "Documentation", exact: true })
        .click();
      let directory = page.getByRole("navigation", {
          name: "Document directory",
          exact: true,
        }),
        article = page.getByRole("article", {
          name: "Document content",
          exact: true,
        });
      await page.keyboard.press("ControlOrMeta+f");
      await expect(
        page.getByLabel("Search documentation", { exact: true }),
      ).toBeFocused();
      await page.getByLabel("Search documentation", { exact: true }).fill("ΟΣ");
      await expect(
        page.getByLabel("Search documentation", { exact: true }),
      ).toHaveValue("ΟΣ");
      const result = directory.getByRole("button", {
        name: "unicode.md 3 matches",
        exact: true,
      });
      await expect(result).toBeVisible();
      await result.focus();
      await expect(result).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(directory).toBeHidden();
      await expect(article).toBeFocused();
      await expect(article.getByRole("status")).toHaveText("1 / 3 matches");
      await expect(article.locator("mark")).toHaveCount(3);
      await page
        .getByRole("button", { name: "Directory", exact: true })
        .click();
      await expect(directory).toBeVisible();
      const handle = page.getByRole("separator", {
        name: "Resize Document directory",
        exact: true,
      });
      const desiredWidth = Math.max(
        180,
        Number(await handle.getAttribute("aria-valuenow")) - 16,
      );
      const box = await handle.boundingBox();
      if (!box) throw Error("Missing directory divider");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 - 16,
        box.y + box.height / 2,
        { steps: 4 },
      );
      await page.mouse.up();
      await expect
        .poll(async () => {
          const reply = await page.evaluate(() =>
            window.voidra.invoke({ command: "snapshot" }),
          );
          return reply.ok && reply.data.kind === "snapshot"
            ? reply.data.layout.value.documentationWidth
            : 0;
        })
        .toBe(desiredWidth);
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.close(),
      );
      if (app.process().exitCode === null) await once(app.process(), "exit");
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page
        .getByRole("button", { name: "Documentation", exact: true })
        .click();
      directory = page.getByRole("navigation", {
        name: "Document directory",
        exact: true,
      });
      article = page.getByRole("article", {
        name: "Document content",
        exact: true,
      });
      await expect(directory).toBeVisible();
      await expect(article).toContainText(
        "Choose a document from the directory",
      );
      const reply = await page.evaluate(() =>
        window.voidra.invoke({ command: "snapshot" }),
      );
      expect(
        reply.ok &&
          reply.data.kind === "snapshot" &&
          reply.data.layout.value.documentationWidth,
      ).toBe(desiredWidth);
      await page.screenshot({
        path: resolve(
          `../../.cache/screenshots/v11-p10-doc-layout-${theme}.png`,
        ),
      });
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
