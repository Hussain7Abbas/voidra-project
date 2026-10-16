import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject } from "voidra";
import { openLegacyIdeaEditor } from "./helpers/legacy-idea.ts";

for (const theme of ["light", "dark"] as const)
  test(`historical backlog edits, rejected reasons and promotion in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-backlog-")),
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
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.keyboard.press("Escape");
      expect(
        await page
          .getByRole("button", { name: "Tasks", exact: true })
          .isEnabled(),
      ).toBe(true);
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Tasks", level: 1, exact: true }),
      ).toBeVisible();
      await openLegacyIdeaEditor(page, root);
      await page.getByLabel("Title", { exact: true }).fill("Export notes");
      await page
        .getByLabel("Description", { exact: true })
        .fill(
          "Export **private** notes.\n\n<script>window.__voidraAttack=true</script>",
        );
      await page.getByLabel("Title", { exact: true }).click();
      await expect(page.locator(".cm-md-strong")).toHaveText("private");
      expect(await page.locator(".markdown-editor script").count()).toBe(0);
      await page
        .getByRole("button", { name: "Save idea", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });

      await page
        .getByRole("button", { name: "Edit idea: Export notes", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Status", { exact: true })
        .selectOption("needs-info");
      await page
        .getByRole("button", { name: "Save idea", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await page
        .getByRole("button", { name: "Edit idea: Export notes", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Status", { exact: true })
        .selectOption("rejected");
      await page
        .getByLabel("Rejection reason", { exact: true })
        .fill("Already covered by the CLI export command.");
      await page
        .getByRole("button", { name: "Save idea", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByText("Already covered by the CLI export command.", {
          exact: true,
        }),
      ).toBeVisible();
      const project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      expect(
        [...project.records.values()].find((r) => r.kind === "idea")?.document
          .data,
      ).toMatchObject({
        title: "Export notes",
        status: "rejected",
        reason: "Already covered by the CLI export command.",
      });
      await page
        .getByRole("button", { name: "Edit idea: Export notes", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Status", { exact: true })
        .selectOption("ready");
      await page
        .getByRole("button", { name: "Save idea", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await page
        .getByRole("button", {
          name: "Promote idea: Export notes",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Action type", { exact: true })
        .selectOption("docs");
      await page
        .getByLabel("Title", { exact: true })
        .fill("Document notes export");
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      const promoted = await checkProject(root),
        idea = [...promoted.records.values()].find((r) => r.kind === "idea");
      expect(idea?.document.data.status).toBe("promoted");
      expect(
        promoted.records.get(
          `.voidra/actions/${idea?.document.data.promotedTo}/action.md`,
        )?.document.data,
      ).toMatchObject({
        type: "docs",
        stage: "implement",
        title: "Document notes export",
        links: [idea?.document.data.id],
      });
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).every((b) =>
          b.getAnimations().every((a) => a.playState !== "running"),
        ),
      );
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
