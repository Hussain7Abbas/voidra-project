import { execFile, execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import { checkProject, parseRecord, serializeRecord } from "voidra";

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
        page.getByText("Release action created", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByRole("heading", { name: "New release", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog", {
          name: "Choose completed work",
          exact: true,
        }),
      ).toBeHidden();
      await expect(page.locator(".action-meta")).toContainText("Plan");
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
      ).toBeEnabled({ timeout: 10000 });
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
      ).toBeEnabled({ timeout: 10000 });
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } catch (error) {
      const page = app.windows()[0];
      if (page)
        console.error("Release selection failure", {
          alerts: await page.getByRole("alert").allTextContents(),
          dialogs: await page.getByRole("dialog").allTextContents(),
          actions: [...(await checkProject(root)).records.values()]
            .filter((record) => record.kind === "action")
            .map(({ document }) => ({
              id: document.data.id,
              type: document.data.type,
              stage: document.data.stage,
            })),
        });
      throw error;
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
for (const theme of ["light", "dark"] as const)
  test(`reviews and locally tags a release through the desktop in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-release-loop-")),
      root = join(temp, "project"),
      repository = resolve("../..");
    await cp(join(repository, "fixtures/new-project/project"), root, {
      recursive: true,
    });
    const path = ".voidra/actions/act-000000/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(
        doc,
        {
          id: "act-000000",
          title: "Completed documentation",
          type: "docs",
          stage: "done",
          status: "complete",
          doneBy: "agent",
        },
        "Completed fixture work.\n",
      ),
    );
    await writeFile(
      join(root, "package.json"),
      '{"name":"release-fixture","version":"0.1.0"}\n',
    );
    await writeFile(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\n## 0.1.0\n- Original.\n",
    );
    await writeFile(join(root, "README.md"), "# Fixture\n");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Release verification"],
      ["config", "user.email", "release@example.test"],
      ["add", "."],
      ["commit", "-qm", "Fixture baseline"],
    ])
      execFileSync("git", args, { cwd: root });
    const git = (args: string[]) =>
        execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
      head = git(["rev-parse", "HEAD"]),
      execute = promisify(execFile);
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
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await page
        .getByRole("button", { name: "New release", exact: true })
        .click();
      await page
        .getByRole("checkbox", { name: "Completed documentation", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Create Release action", exact: true })
        .click();
      await expect(
        page.getByText("Release action created", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.getByRole("heading", { name: "New release", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog", { name: "Choose completed work" }),
      ).toBeHidden();
      const id = [...(await checkProject(root)).records.values()].find(
        (record) =>
          record.kind === "action" && record.document.data.type === "release",
      )?.document.data.id;
      if (typeof id !== "string") throw new Error("Release missing");
      const run = async () => {
        const queue = page.getByRole("button", {
          name: "Queue for agent",
          exact: true,
        });
        await expect(queue).toBeEnabled();
        await queue.click();
        await expect
          .poll(async () =>
            (await checkProject(root)).records
              .get(".voidra/local/pending-actions.md")
              ?.document.body.includes(id),
          )
          .toBe(true);
        await execute(
          process.execPath,
          [
            join(repository, "tools/fake-agent/src/cli-entry.ts"),
            root,
            "success",
          ],
          { cwd: repository },
        );
      };
      await run();
      await expect(
        page.getByText("Version: 0.2.0", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Completed fixture documentation.", { exact: true }),
      ).toBeVisible();
      expect(git(["rev-parse", "HEAD"])).toBe(head);
      expect(git(["tag", "--list"])).toBe("");
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await page
        .getByLabel("Feedback", { exact: true })
        .fill("Clarify release notes.");
      await page
        .getByRole("button", { name: "Send back to Plan", exact: true })
        .click();
      await expect(
        page.getByText("Sent back for changes", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await expect(page.locator(".action-meta")).toContainText("Plan");
      await run();
      await expect(
        page.getByText(
          "Clarified: This release is local only; nothing is published.",
          { exact: true },
        ),
      ).toBeVisible();
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(
        page.getByText("Action accepted", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      await expect(page.locator(".action-meta")).toContainText("Review");
      expect(git(["rev-parse", "HEAD"])).toBe(head);
      expect(git(["tag", "--list"])).toBe("");
      await run();
      await expect(page.locator(".action-meta")).toContainText("Released");
      const after = await checkProject(root);
      expect(after.diagnostics).toEqual([]);
      expect(
        after.records.get(".voidra/actions/act-000000/action.md")?.document.data
          .stage,
      ).toBe("released");
      expect(git(["rev-list", "--count", "HEAD"])).toBe("2");
      expect(git(["tag", "--list"])).toBe("v0.2.0");
      expect(git(["rev-parse", "v0.2.0^{commit}"])).toBe(
        git(["rev-parse", "HEAD"]),
      );
      expect(
        JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
      ).toBe("0.2.0");
      expect(await readFile(join(root, "CHANGELOG.md"), "utf8")).toContain(
        "## 0.1.0\n- Original.",
      );
      await page.getByRole("button", { name: "Releases", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "0.2.0", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Tag: v0.2.0", { exact: true }),
      ).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
    } catch (error) {
      const page = app.windows()[0];
      if (page)
        console.error("Release loop failure", {
          alerts: await page.getByRole("alert").allTextContents(),
          dialogs: await page.getByRole("dialog").allTextContents(),
          stage: await page.locator(".action-meta").allTextContents(),
        });
      throw error;
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
