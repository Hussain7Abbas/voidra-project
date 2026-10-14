import { execFile, execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`outside-work suggestion refreshes after standalone sync in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-sync-ui-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/new-project/project"), root, {
      recursive: true,
    });
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Sync fixture"],
      ["config", "user.email", "sync@example.test"],
      ["add", "."],
      ["commit", "-qm", "Outside baseline"],
    ])
      git(args);
    const head = git(["rev-parse", "HEAD"]),
      profile = await readFile(join(root, ".voidra/profile/problem.md"));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (pair): pair is [string, string] =>
          pair[1] !== undefined &&
          !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
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
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.keyboard.press("Escape");
      const suggestion = page.getByRole("region", {
        name: "Changes outside Voidra",
      });
      await expect(suggestion).toBeVisible();
      const copy = page.getByRole("button", {
        name: "Copy $voidra-sync",
        exact: true,
      });
      await copy.focus();
      await page.keyboard.press("Enter");
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        "$voidra-sync",
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      const repository = resolve("../.."),
        run = () =>
          promisify(execFile)(
            process.execPath,
            [
              join(repository, "tools/fake-agent/src/cli-entry.ts"),
              root,
              "sync",
            ],
            { cwd: repository },
          );
      await run();
      await expect(suggestion).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Backlog", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Backlog", exact: true }).click();
      await expect(
        page.getByText("Document outside changes", { exact: true }),
      ).toBeVisible();
      const project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      expect(
        [...project.records.values()].filter((r) => r.kind === "sync"),
      ).toHaveLength(1);
      await run();
      expect(
        [...(await checkProject(root)).records.values()].filter(
          (r) => r.kind === "idea",
        ),
      ).toHaveLength(1);
      expect(await readFile(join(root, ".voidra/profile/problem.md"))).toEqual(
        profile,
      );
      expect(git(["rev-parse", "HEAD"])).toBe(head);
      expect(git(["tag"])).toBe("");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
