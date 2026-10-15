import {
  cp,
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

for (const theme of ["light", "dark"] as const)
  test(`searches and navigates full Markdown documentation in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-docs-ui-")),
      root = join(temp, "project"),
      data = join(temp, "data");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await mkdir(join(root, "docs/nested"), { recursive: true });
    await mkdir(data);
    await writeFile(
      join(data, "settings.json"),
      JSON.stringify({ version: 1, theme, recents: [], skillsOfferSeen: true }),
    );
    const body =
      "# Guide\n\nAlpha **beta** and alpha beta. [Other page](other.md)\n\n| Name | Meaning |\n| --- | --- |\n| Alpha | beta |\n\n```text\nA.*B and İ🙂\n\nintact fence\n```\n\n- first\n\n  second paragraph\n";
    await writeFile(join(root, "docs/nested/guide.md"), body);
    await writeFile(
      join(root, "docs/nested/other.md"),
      "# Other\n\nAlpha beta. [Guide](guide.md) [Missing](missing.md)\n",
    );
    await writeFile(join(root, "GLOSSARY.md"), body);
    await writeFile(join(root, "private.md"), "private secret");
    await symlink(join(root, "private.md"), join(root, "docs/linked.md"));
    await writeFile(join(root, "docs/bad.md"), Buffer.from([255]));
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
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.locator("#toggle-actions").click();
      await page
        .getByRole("button", { name: "Documentation", exact: true })
        .click();
      const directory = page.getByRole("navigation", {
          name: "Document directory",
          exact: true,
        }),
        article = page.getByRole("article", { name: "Document content" });
      await expect(
        directory.getByRole("button", { name: "guide.md", exact: true }),
      ).toBeVisible();
      await expect(
        directory.getByRole("region", { name: "Documentation problems" }),
      ).toContainText("symlink");
      await expect(article).toContainText(
        "Choose a document from the directory",
      );
      await page
        .getByLabel("Search documentation", { exact: true })
        .fill("alpha beta");
      await expect(
        directory.getByRole("button", {
          name: "guide.md 2 matches",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        article.getByRole("heading", { name: "Guide", exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Search documentation", { exact: true }).fill("");
      await directory
        .getByRole("button", { name: "guide.md", exact: true })
        .click();
      await expect(
        article.getByRole("heading", { name: "Guide", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+f");
      await expect(
        page.getByLabel("Search documentation", { exact: true }),
      ).toBeFocused();
      await page
        .getByLabel("Search documentation", { exact: true })
        .fill("alpha beta");
      await expect(
        directory.getByRole("button", {
          name: "guide.md 2 matches",
          exact: true,
        }),
      ).toBeVisible();
      await expect(article.getByRole("status")).toHaveText("1 / 2 matches");
      await expect(article.locator('[data-document-match="0"]')).toHaveCount(2);
      await article
        .getByRole("button", { name: "Next match", exact: true })
        .click();
      await expect(article.getByRole("status")).toHaveText("2 / 2 matches");
      await expect(article.locator("mark.current-document-match")).toHaveText(
        "alpha beta",
      );
      await directory
        .getByRole("button", { name: "other.md 1 matches", exact: true })
        .click();
      await expect(
        article.getByRole("heading", { name: "Other", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Search documentation")).toHaveValue(
        "alpha beta",
      );
      await page
        .getByRole("button", { name: "Previous document", exact: true })
        .click();
      await expect(
        article.getByRole("heading", { name: "Guide", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Next document", exact: true })
        .click();
      await expect(
        article.getByRole("heading", { name: "Other", exact: true }),
      ).toBeVisible();
      await article
        .getByRole("button", { name: "Missing", exact: true })
        .click();
      await expect(article.getByRole("alert")).toContainText(
        "document is missing",
      );
      await page
        .getByRole("button", { name: "Previous document", exact: true })
        .click();
      await writeFile(
        join(root, "docs/nested/other.md"),
        "# Other\n\nAlpha beta. Alpha beta.\n",
      );
      await expect(
        directory.getByRole("button", {
          name: "other.md 2 matches",
          exact: true,
        }),
      ).toBeVisible({ timeout: 5000 });
      await expect(article.getByRole("status")).toHaveText("1 / 2 matches");
      await writeFile(
        join(root, "docs/nested/new.md"),
        "# New\n\nalpha beta\n",
      );
      await expect(
        directory.getByRole("button", {
          name: "new.md 1 matches",
          exact: true,
        }),
      ).toBeVisible();
      await rm(join(root, "docs/nested/new.md"));
      await expect(
        directory.getByRole("button", {
          name: "new.md 1 matches",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.getByLabel("Search documentation").fill("A.*B");
      await expect(
        directory.getByRole("button", {
          name: "guide.md 1 matches",
          exact: true,
        }),
      ).toBeVisible();
      await directory
        .getByRole("button", { name: "guide.md 1 matches", exact: true })
        .click();
      await expect(article.locator("pre")).toContainText("intact fence");
      await expect(article.locator("table")).toHaveCount(1);
      await page.getByLabel("Search documentation").fill("no-such-text");
      await expect(directory).toContainText("No matching documents");
      await page.getByLabel("Search documentation").fill("");
      const splitter = page.getByRole("separator", {
        name: "Resize Document directory",
        exact: true,
      });
      await splitter.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(async () => {
          const result = await page.evaluate(() =>
            window.voidra.invoke({ command: "snapshot" }),
          );
          return result.ok && result.data.kind === "snapshot"
            ? result.data.layout.value.documentationWidth
            : 0;
        })
        .toBe(256);
      await page
        .getByRole("button", { name: "Directory", exact: true })
        .click();
      await expect(directory).toBeHidden();
      await page
        .getByRole("button", { name: "Directory", exact: true })
        .click();
      await expect(directory).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(
          `../../.cache/screenshots/v11-p08-documentation-${theme}.png`,
        ),
      });
      await page.getByRole("button", { name: "Glossary", exact: true }).click();
      await page.getByLabel("Search glossary", { exact: true }).fill("intact");
      await expect(page.locator("main pre")).toContainText("intact fence");
      await expect(page.locator("main table")).toHaveCount(1);
      await expect(page.locator("main mark")).toHaveText("intact");
      expect(await readFile(join(root, "docs/nested/guide.md"), "utf8")).toBe(
        body,
      );
      expect(await readFile(join(root, "GLOSSARY.md"), "utf8")).toBe(body);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
