import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

for (const theme of ["light", "dark"] as const)
  test(`selects monorepo release folders on Releases and keeps Profile last in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-monorepo-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    for (const [path, version] of Object.entries({
      "package.json": "0.0.0",
      "app/web/package.json": "2.9.0",
      "app/native/package.json": "2.10.0",
      "products/api/package.json": "3.0.0",
      "node_modules/ignore/package.json": "99.0.0",
    })) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), JSON.stringify({ version }));
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(entry[0]),
      ),
    );
    const launch = () =>
      launchConfiguredApp(
        {
          args: [resolve("."), `--project=${root}`],
          env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
        },
        { theme },
      );
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await expect(
        page
          .getByRole("navigation", { name: "Project pages" })
          .getByRole("button"),
      ).toHaveText(["Tasks", "Documentation", "Releases", "Profile"]);
      await expect(
        page.locator("summary").filter({ hasText: "Release settings" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .locator("summary")
        .filter({ hasText: "Release settings" })
        .click();
      await expect(
        page.getByText("Current release 3.0.0", { exact: true }),
      ).toBeVisible();
      await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      await page
        .getByRole("button", { name: "Choose folder…", exact: true })
        .click();
      await expect(
        page.getByLabel("Release folder", { exact: true }),
      ).toHaveValue(".");
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      }, temp);
      await page
        .getByRole("button", { name: "Choose folder…", exact: true })
        .click();
      await expect(
        page.getByText("Choose a folder inside the open project", {
          exact: true,
        }),
      ).toBeVisible();
      await app.evaluate(
        ({ dialog }, folder) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [folder],
          });
        },
        join(root, "app"),
      );
      await page
        .getByRole("button", { name: "Choose folder…", exact: true })
        .click();
      await expect(
        page.getByLabel("Release folder", { exact: true }),
      ).toHaveValue("app");
      await page
        .getByRole("button", { name: "Use folder", exact: true })
        .click();
      await expect(
        page.getByText("Current release 2.10.0", { exact: true }),
      ).toBeVisible();
      expect(
        JSON.parse(await readFile(join(root, ".voidra/voidra.json"), "utf8")),
      ).toMatchObject({
        releaseDirectory: "app",
        releasePackage: "app/native/package.json",
      });
      await page.evaluate(async () => {
        const current = await window.voidra.invoke({ command: "workspace" });
        if (
          !current.ok ||
          current.data.kind !== "workspace" ||
          !current.data.workspace.editing.undo.revision
        )
          throw Error("Missing folder selection undo");
        const undo = await window.voidra.invoke({
          command: "undo",
          revision: current.data.workspace.editing.undo.revision,
        });
        if (
          !undo.ok ||
          undo.data.kind !== "workspace" ||
          undo.data.workspace.projectRelease.version !== "3.0.0" ||
          !undo.data.workspace.editing.redo.revision
        )
          throw Error("Folder selection undo failed");
        const redo = await window.voidra.invoke({
          command: "redo",
          revision: undo.data.workspace.editing.redo.revision,
        });
        if (
          !redo.ok ||
          redo.data.kind !== "workspace" ||
          redo.data.workspace.projectRelease.version !== "2.10.0"
        )
          throw Error("Folder selection redo failed");
      });
      await writeFile(
        join(root, "app/web/package.json"),
        '{"version":"4.0.0"}',
      );
      await expect(
        page.getByText("Current release 4.0.0", { exact: true }),
      ).toBeVisible({ timeout: 5000 });
      await mkdir(join(root, "app/new"));
      await writeFile(
        join(root, "app/new/package.json"),
        '{"version":"5.0.0"}',
      );
      await expect(
        page.getByText("Current release 5.0.0", { exact: true }),
      ).toBeVisible({ timeout: 5000 });
      await page.setViewportSize({ width: 1000, height: 700 });
      await expect(
        page.getByRole("button", { name: "Choose folder…", exact: true }),
      ).toBeInViewport();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode().analyze()).violations,
      ).toEqual([]);
      await page.screenshot({
        path: `/tmp/voidra-release-source-${theme}-narrow.png`,
      });
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .locator("summary")
        .filter({ hasText: "Release settings" })
        .click();
      await expect(
        page.getByLabel("Release folder", { exact: true }),
      ).toHaveValue("app");
      await expect(
        page.getByText("Current release 5.0.0", { exact: true }),
      ).toBeVisible();
      // Keep review screenshots outside the fixture removed below.
      await page.screenshot({
        path: `/tmp/voidra-release-source-${theme}.png`,
      });
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
