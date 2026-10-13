import { execFile, execFileSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron, expect, test } from "@playwright/test";
import { checkProject } from "voidra";

const execute = promisify(execFile);
for (const type of [
  "feature",
  "bug",
  "improvement",
  "profile-change",
  "research",
  "docs",
])
  test(`queues, plans, runs and accepts ${type} through the desktop`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-lifecycles-ui-")),
      root = join(temp, "project"),
      repository = resolve("../..");
    await cp(join(repository, "fixtures/new-project/project"), root, {
      recursive: true,
    });
    await writeFile(join(root, "README.md"), "# Fixture\n");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Voidra Verification"],
      ["config", "user.email", "verification@example.test"],
      ["add", "."],
      ["commit", "-qm", "Initial fixture"],
    ])
      execFileSync("git", args, { cwd: root });
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

      await page
        .getByRole("button", { name: "New action", exact: true })
        .click();
      await page.getByLabel("Action type", { exact: true }).selectOption(type);
      await page.getByLabel("Title", { exact: true }).fill(`Lifecycle ${type}`);
      await page
        .getByLabel("Description", { exact: true })
        .fill("Document one local installation boundary.");
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await page
        .getByRole("button", { name: `Lifecycle ${type}`, exact: true })
        .click();
      const queue = page.getByRole("button", {
        name: "Queue for agent",
        exact: true,
      });
      await expect(queue).toBeEnabled();
      await queue.click();
      await expect(
        page.getByText("Action queued", { exact: true }),
      ).toBeVisible();
      await execute(
        process.execPath,
        [
          join(repository, "tools/fake-agent/src/cli-entry.ts"),
          root,
          "success",
        ],
        { cwd: repository },
      );
      if (!["research", "docs"].includes(type)) {
        const approve = page.getByRole("button", {
          name: "Approve plan",
          exact: true,
        });
        await expect(approve).toBeEnabled();
        await approve.click();
        await expect(
          page.getByText("Plan approved", { exact: true }),
        ).toBeVisible();
        await expect(queue).toBeEnabled();
        await queue.click();
        await expect
          .poll(async () => {
            const project = await checkProject(root);
            const id = [...project.records.values()].find(
              (record) =>
                record.kind === "action" &&
                record.document.data.title === `Lifecycle ${type}`,
            )?.document.data.id;
            return Boolean(
              id &&
                project.records
                  .get(".voidra/local/pending-actions.md")
                  ?.document.body.includes(String(id)),
            );
          })
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
      }
      const accept = page.getByRole("button", { name: "Accept", exact: true });
      await expect(accept).toBeEnabled();
      await accept.click();
      await expect(page.locator(".action-meta")).toContainText("Done");
      expect((await checkProject(root)).diagnostics).toEqual([]);
      const action = [...(await checkProject(root)).records.values()].find(
        (r) =>
          r.kind === "action" && r.document.data.title === `Lifecycle ${type}`,
      );
      expect(action?.document.data.commits).toEqual(
        type === "research" ? undefined : [expect.any(String)],
      );
      await page
        .getByRole("button", { name: "Back to actions", exact: true })
        .click();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true, maxRetries: 3 });
    }
  });
