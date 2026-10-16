import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { _electron, expect, test } from "@playwright/test";
import {
  checkProject,
  createAction,
  createIdea,
  hash,
  replaceActionQueue,
} from "voidra";
import { publishFakeGate } from "../../../tools/fake-agent/src/gates.ts";
import { showWaiting } from "./workspace-helpers.ts";

const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (p): p is [string, string] =>
      p[1] !== undefined &&
      !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
  ),
);
const repository = resolve("../..");
async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "voidra-undo-ui-")),
    root = join(temp, "project");
  await cp(join(repository, "fixtures/new-project/project"), root, {
    recursive: true,
  });
  const launch = () =>
    _electron.launch({
      args: [resolve("."), `--project=${root}`],
      env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
    });
  return { temp, root, launch };
}

for (const theme of ["light", "dark"] as const)
  test(`undoes promotion after restart, keeps text undo native and confirms outside edits in ${theme}`, async () => {
    const { temp, root, launch } = await fixture();
    let app = await launch();
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await page
        .getByRole("button", { name: "Add to Backlog", exact: true })
        .click();
      await page.getByRole("radio", { name: "Normal", exact: true }).check();
      const title = page.getByLabel("Title", { exact: true });
      await title.fill("Export");
      await title.press("End");
      await title.pressSequentially(" notes");
      await title.press("Meta+z");
      // Chromium owns native input undo grouping; an async autosave may split typing.
      await expect(title).not.toHaveValue("Export notes");
      await expect(title).toHaveValue(/^Export/);
      await title.press("Meta+Shift+z");
      await expect(title).toHaveValue("Export notes");
      await title.fill("Export notes");
      await page
        .getByLabel("Description", { exact: true })
        .fill("Keep a private copy.");
      await page
        .getByRole("button", { name: "Save idea", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await page
        .getByRole("button", { name: "Export notes", exact: true })
        .click();
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
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      const project = await checkProject(root),
        idea = [...project.records.values()].find((r) => r.kind === "idea");
      const id = String(idea?.document.data.promotedTo),
        path = join(root, `.voidra/actions/${id}/action.md`),
        bytes = await readFile(path);
      await expect(
        page.getByRole("button", { name: "Undo Promote idea", exact: true }),
      ).toBeEnabled();
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      const undo = page.getByRole("button", {
        name: "Undo Promote idea",
        exact: true,
      });
      await expect(undo).toBeEnabled();
      await undo.focus();
      await page.keyboard.press("Meta+z");
      await expect
        .poll(async () =>
          (await checkProject(root)).files.has(
            `.voidra/actions/${id}/action.md`,
          ),
        )
        .toBe(false);
      const redo = page.getByRole("button", {
        name: "Redo Promote idea",
        exact: true,
      });
      await expect(redo).toBeEnabled();
      await redo.focus();
      await page.keyboard.press("Meta+Shift+z");
      await expect
        .poll(async () => {
          try {
            return hash(await readFile(path));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
          }
        })
        .toBe(hash(bytes));
      await page.getByRole("button", { name: "Profile", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Edit What should this project make possible?",
          exact: true,
        })
        .click();
      await page
        .getByLabel(/What should this project make possible/)
        .fill("Edited outcome");
      await page
        .getByRole("button", { name: "Save answer", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByRole("button", {
          name: "Undo Edit profile answer",
          exact: true,
        }),
      ).toBeEnabled();
      const profile = join(root, ".voidra/profile/problem.md");
      await writeFile(
        profile,
        `${await readFile(profile, "utf8")}\nTeammate note.\n`,
      );
      const outside = await readFile(profile);
      await expect
        .poll(async () => {
          const response = await page.evaluate(() =>
            window.voidra.invoke({ command: "workspace" }),
          );
          return response.ok && response.data.kind === "workspace"
            ? response.data.workspace.editing.undo.conflicts
            : [];
        })
        .toContain(".voidra/profile/problem.md");
      await page
        .getByRole("button", { name: "Undo Edit profile answer", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Overwrite changes on disk?" }),
      ).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({
        path: resolve(`../../.cache/screenshots/p10-undo-${theme}.png`),
      });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await readFile(profile)).toEqual(outside);
      await page
        .getByRole("button", { name: "Undo Edit profile answer", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Overwrite and undo", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30000 });
      await expect(
        page.getByText("Save and reopen private project notes offline.", {
          exact: true,
        }),
      ).toBeVisible();
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });

test("undoes a saved question answer through the native Edit menu", async () => {
  const { temp, root, launch } = await fixture();
  const id = await createAction(root, {
    type: "feature",
    title: "Export",
    description: "A private export.",
    by: "You",
  });
  await publishFakeGate(root, id, "questions");
  const path = join(root, `.voidra/actions/${id}/questions.md`),
    before = await readFile(path),
    app = await launch();
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await showWaiting(page);
    await page
      .getByRole("button", { name: "Who can read the notes?", exact: true })
      .click();
    await page
      .getByRole("radio", { name: "a · Recommended Only the owner" })
      .check();
    await page
      .getByRole("button", { name: "Save answer", exact: true })
      .click();
    await expect(page.getByText("Answer: a", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        app.evaluate(
          ({ Menu }) =>
            Menu.getApplicationMenu()?.getMenuItemById("project-undo")?.label,
        ),
      )
      .toBe("Undo Answer question");
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById("project-undo");
      item?.click(
        item,
        BrowserWindow.getAllWindows()[0],
        BrowserWindow.getAllWindows()[0]?.webContents,
      );
    });
    await expect
      .poll(async () => {
        try {
          return hash(await readFile(path));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      })
      .toBe(hash(before));
    await expect(
      page.getByRole("button", { name: "Redo Answer question", exact: true }),
    ).toBeEnabled();
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});

for (const direction of ["undo", "redo"] as const)
  test(`blocks ${direction} before agent work and after interruption, recovery and restart`, async () => {
    const { temp, root, launch } = await fixture();
    await writeFile(join(root, "README.md"), "# Source boundary\n");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Tests"],
      ["config", "user.email", "tests@example.test"],
      ["add", "."],
      ["commit", "-qm", "Initial"],
    ])
      execFileSync("git", args, { cwd: root });
    const idea = await createIdea(root, {
        title: "Before agent",
        description: "Consumed idea",
        by: "You",
      }),
      action = await createAction(root, {
        type: "docs",
        title: "Paused work",
        description: "No work before consumption check.",
        by: "You",
      });
    let app = await launch();
    let child: ReturnType<typeof spawn> | undefined;
    try {
      let page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      const project = await checkProject(root),
        raw = project.files.get(`.voidra/backlog/${idea}.md`);
      const result = await page.evaluate(
        async (input) => window.voidra.invoke(input),
        {
          command: "edit-idea",
          id: idea,
          revision: hash(raw as Buffer),
          title: "After edit",
          description: "Consumed idea",
          status: "new",
        } as const,
      );
      expect(result.ok).toBe(true);
      if (direction === "redo") {
        await page
          .getByRole("button", { name: "Undo Edit idea", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Redo Edit idea", exact: true }),
        ).toBeEnabled();
      }
      await replaceActionQueue(root, {
        ids: [action],
        revision: null,
        by: "You",
      });
      const source = await readFile(join(root, "README.md"));
      child = spawn(
        process.execPath,
        [
          join(repository, "tools/fake-agent/src/cli-entry.ts"),
          root,
          "pause-after-start",
        ],
        { cwd: repository, stdio: ["ignore", "pipe", "pipe"] },
      );
      const output = await once(
        child.stdout as NonNullable<typeof child.stdout>,
        "data",
      );
      const run = JSON.parse(String(output[0])).run as string;
      const buttonName = `${direction === "undo" ? "Undo" : "Redo"} Edit idea`;
      await expect(
        page.getByRole("button", { name: buttonName, exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: run }),
      ).toBeVisible();
      const started = await checkProject(root);
      expect(
        started.records.get(`.voidra/actions/${action}/action.md`)?.document
          .data.stage,
      ).toBe("implement");
      expect(await readFile(join(root, "README.md"))).toEqual(source);
      child.kill("SIGKILL");
      await once(child, "exit");
      child = undefined;
      await app.close();
      execFileSync(
        process.execPath,
        [
          join(repository, "skills/voidra-go/scripts/runtime.mjs"),
          "recover",
          "--project",
          root,
          "--run",
          run,
        ],
        { cwd: repository },
      );
      app = await launch();
      page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: run }),
      ).toBeVisible();
      expect(
        (await checkProject(root)).files.has(".voidra/local/run.lock"),
      ).toBe(false);
      expect(await readFile(join(root, "README.md"))).toEqual(source);
    } finally {
      child?.kill("SIGKILL");
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
