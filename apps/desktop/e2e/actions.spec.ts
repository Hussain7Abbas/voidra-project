import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { parseRecord, serializeRecord } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`action details render safe Markdown and run results in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-detail-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/busy-project/project"), root, {
      recursive: true,
    });
    const path = ".voidra/actions/act-000011/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(
        doc,
        doc.data,
        "## Useful heading\n\n**Readable** description.\n\n| Step | Result |\n| --- | --- |\n| Format | **Preserved** |\n\n- [x] Safe checklist\n\n<script>window.__voidraAttack=true</script>\n\n[Unsafe link](javascript:alert(1))\n\n<img src=x onerror='window.__voidraAttack=true'>\n",
      ),
    );
    const runPath =
      ".voidra/actions/act-000011/runs/2026-10-13T000000Z-codex-run-999999.md";
    await mkdir(join(root, ".voidra/actions/act-000011/runs"), {
      recursive: true,
    });
    await writeFile(
      join(root, runPath),
      serializeRecord(
        parseRecord(runPath, "---\n{}\n---\n"),
        {
          id: "run-999999",
          action: "act-000011",
          agent: "codex",
          startedAt: "2026-10-13T00:00:00.000Z",
          endedAt: "2026-10-13T00:01:00.000Z",
          fromStage: "implement",
          toStage: "review",
          outcome: "advanced",
          consumedRecords: ["act-000011"],
          checks: [{ name: "Documentation reviewed", passed: true }],
        },
        "Docs changed in this fixture.\n",
      ),
    );
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
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).every((button) =>
          button
            .getAnimations()
            .every((animation) => animation.playState !== "running"),
        ),
      );
      await page
        .getByRole("heading", { name: "Actions", exact: true })
        .waitFor();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      expect(
        await page
          .getByRole("button", { name: String(doc.data.title), exact: true })
          .count(),
      ).toBe(1);
      await page
        .getByRole("button", { name: String(doc.data.title), exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: String(doc.data.title),
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Useful heading" }),
      ).toBeVisible();
      await expect(page.getByText("Readable", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "Preserved", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".markdown input[type=checkbox]"),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __voidraAttack?: boolean })
              .__voidraAttack ?? false,
        ),
      ).toBe(false);
      expect(
        await page
          .locator(
            '.markdown script, .markdown img, .markdown [onerror], .markdown a[href^="javascript:"]',
          )
          .count(),
      ).toBe(0);
      await expect(
        page.getByRole("heading", { name: "Run results" }),
      ).toBeVisible();
      await expect(
        page.getByText("Docs changed in this fixture.", { exact: true }),
      ).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/p03-action-${theme}.png`),
      });
      await page
        .getByRole("button", { name: "Back to actions", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Actions", exact: true }),
      ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
