import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, serializeRecord } from "voidra";

for (const theme of ["light", "dark"] as const)
  test(`release selection and history are keyboard accessible in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-release-ui-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/busy-project/project"), root, {
      recursive: true,
    });
    const project = await checkProject(root);
    await rm(join(root, ".voidra/local/run.lock"), { force: true });
    for (const record of project.records.values()) {
      const data = record.document.data;
      if (record.kind === "run" && data.outcome === "running")
        await writeFile(
          join(root, record.document.file),
          serializeRecord(record.document, {
            ...data,
            outcome: "interrupted",
            endedAt: data.startedAt,
          }),
        );
      if (record.kind === "action" && data.status === "running")
        await writeFile(
          join(root, record.document.file),
          serializeRecord(record.document, { ...data, status: "ready" }),
        );
    }
    const selected = [...project.records.values()].find(
      (record) =>
        record.kind === "action" &&
        record.document.data.type === "docs" &&
        record.document.data.stage === "done",
    );
    if (!selected) throw new Error("Missing done Docs action");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Release fixture"],
      ["config", "user.email", "release@example.test"],
      ["add", "."],
      ["commit", "-qm", "Fixture baseline"],
    ])
      execFileSync("git", args, { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
    }).toString();
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
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page.keyboard.press("Escape");
      const releases = page.getByRole("button", {
        name: "Releases",
        exact: true,
      });
      await expect(releases).toBeEnabled();
      await releases.click();
      await expect(
        page.getByRole("heading", { name: "0.1.0", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "New release", exact: true })
        .click();
      const checkbox = page.getByRole("checkbox", {
        name: String(selected.document.data.title),
        exact: true,
      });
      await checkbox.focus();
      await page.keyboard.press("Space");
      await expect(
        page.getByRole("checkbox", { name: "docs released", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Create Release action", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "New release", exact: true }),
      ).toBeVisible();
      const after = await checkProject(root);
      expect(after.diagnostics).toEqual([]);
      expect(
        [...after.records.values()].find(
          (record) =>
            record.kind === "action" &&
            record.document.data.title === "New release",
        )?.document.data,
      ).toMatchObject({
        type: "release",
        stage: "plan",
        status: "ready",
        releaseActions: [selected.document.data.id],
      });
      expect(
        execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString(),
      ).toBe(head);
      expect(
        execFileSync("git", ["tag", "--list"], { cwd: root }).toString(),
      ).toBe("");
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page
        .getByRole("button", { name: "Undo Create release", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Redo Create release", exact: true }),
      ).toBeEnabled();
      expect(
        [...(await checkProject(root)).records.values()].some(
          (record) =>
            record.kind === "action" &&
            record.document.data.title === "New release",
        ),
      ).toBe(false);
      await page
        .getByRole("button", { name: "Redo Create release", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Undo Create release", exact: true }),
      ).toBeEnabled();
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
