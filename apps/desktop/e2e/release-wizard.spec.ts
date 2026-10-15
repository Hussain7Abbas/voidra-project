import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import {
  checkProject,
  enableTaskTracking,
  parseRecord,
  previewTaskTracking,
  serializeRecord,
} from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`preserves every release step and refuses stale source in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-release-wizard-")),
      root = join(temp, "project"),
      data = join(temp, "data"),
      choice = theme === "light" ? "keep" : "move";
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    await mkdir(data);
    await writeFile(
      join(data, "settings.json"),
      JSON.stringify({ version: 1, theme, recents: [], skillsOfferSeen: true }),
    );
    await writeFile(join(root, "package.json"), '{"version":"1.2.3"}\n');
    const metadataPath = ".voidra/voidra.json",
      metadata = parseRecord(
        metadataPath,
        await readFile(join(root, metadataPath)),
      );
    await writeFile(
      join(root, metadataPath),
      serializeRecord(metadata, { ...metadata.data, requiredVoidra: "1.1.0" }),
    );
    for (const [id, title, targetRelease] of [
      ["act-000000", "Current work", "1.2.3"],
      ["act-000001", "Historical work", "1.1.0"],
    ] as const) {
      const path = `.voidra/actions/${id}/action.md`;
      await mkdir(join(root, `.voidra/actions/${id}`), { recursive: true });
      await writeFile(
        join(root, path),
        serializeRecord(parseRecord(path, "---\n{}\n---\n"), {
          id,
          type: "docs",
          title,
          stage: "done",
          status: "complete",
          doneBy: "agent",
          targetRelease,
        }),
      );
    }
    await enableTaskTracking(root, {
      revision: (await previewTaskTracking(root)).revision,
    });
    const before = await readFile(
      join(root, ".voidra/actions/act-000000/action.md"),
    );
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Wizard fixture"],
      ["config", "user.email", "wizard@example.test"],
      ["add", "."],
      ["commit", "-qm", "Baseline"],
    ])
      execFileSync("git", args, { cwd: root });
    const git = (args: string[]) =>
        execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
      head = git(["rev-parse", "HEAD"]);
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
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .getByRole("button", { name: "New release", exact: true })
        .click();
      await page
        .getByRole("checkbox", { name: "Current work", exact: true })
        .check();
      await page
        .getByRole("checkbox", { name: "Historical work", exact: true })
        .check();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page
        .getByLabel("Xeploy bump type", { exact: true })
        .selectOption("custom");
      await page.getByLabel("New release version", { exact: true }).fill("1.");
      await page
        .getByRole("textbox", { name: "Proposed release notes", exact: true })
        .fill("# Notes\n\nPreserve **unfinished** release choices.");
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      expect(
        [...(await checkProject(root)).records.values()].filter(
          (record) =>
            record.kind === "action" && record.document.data.type === "release",
        ),
      ).toHaveLength(0);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.close(),
      );
      if (app.process().exitCode === null) await once(app.process(), "exit");
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .getByRole("button", { name: "New release", exact: true })
        .click();
      await page.getByRole("button", { name: /Restore draft/ }).click();
      await expect(
        page.getByLabel("New release version", { exact: true }),
      ).toHaveValue("1.");
      await expect(
        page.getByRole("textbox", {
          name: "Proposed release notes",
          exact: true,
        }),
      ).toContainText("unfinished");
      await page
        .getByLabel("New release version", { exact: true })
        .fill("1.3.0");
      await page.keyboard.press("ControlOrMeta+s");
      await expect(
        page.getByRole("dialog", {
          name: "Review release choices",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Create Release action",
          exact: true,
        }),
      ).toBeDisabled();
      const choices = page.getByRole("group", {
        name: "Done-ticket release assignment",
        exact: true,
      });
      await expect(choices).toContainText("Current work · act-000000");
      await expect(choices).not.toContainText("Historical work");
      await page
        .getByRole("radio", {
          name:
            choice === "keep"
              ? "Keep Done tickets at 1.2.3 (current release)"
              : "Move these Done tickets to 1.3.0 (new release)",
          exact: true,
        })
        .check();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/v11-p09-release-${theme}.png`),
      });
      await writeFile(join(root, "package.json"), '{ "version": "1.2.3" }\n');
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
        "version source changed",
        { timeout: 5000 },
      );
      await expect(
        page.getByRole("button", {
          name: "Create Release action",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "New draft", exact: true })
        .click();
      await page
        .getByRole("checkbox", { name: "Current work", exact: true })
        .check();
      await page
        .getByRole("checkbox", { name: "Historical work", exact: true })
        .check();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page
        .getByLabel("Xeploy bump type", { exact: true })
        .selectOption("minor");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page
        .getByRole("radio", {
          name:
            choice === "keep"
              ? "Keep Done tickets at 1.2.3 (current release)"
              : "Move these Done tickets to 1.3.0 (new release)",
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: "Create Release action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30000 });
      const after = await checkProject(root),
        action = [...after.records.values()].find(
          (record) =>
            record.kind === "action" && record.document.data.type === "release",
        );
      expect(after.diagnostics).toEqual([]);
      expect(action?.document.data.releasePreparation).toMatchObject({
        version: "1.3.0",
        ticketChoice: choice,
        tickets: [{ id: "act-000000" }],
      });
      expect(
        await readFile(join(root, ".voidra/actions/act-000000/action.md")),
      ).toEqual(before);
      expect(await readFile(join(root, "package.json"), "utf8")).toBe(
        '{ "version": "1.2.3" }\n',
      );
      expect(git(["rev-parse", "HEAD"])).toBe(head);
      expect(git(["tag", "--list"])).toBe("");
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
