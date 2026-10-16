import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createAction, parseRecord, serializeRecord } from "voidra";
import { launchConfiguredApp } from "./helpers/configured-app.ts";

const environment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
    ),
  );
for (const theme of ["light", "dark"] as const)
  test(`leaves conflicts untouched and permits unrelated planning in ${theme}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "voidra-conflict-ui-")),
      root = join(temp, "project");
    await cp(resolve("../../fixtures/conflicted/project"), root, {
      recursive: true,
    });
    const path = ".voidra/actions/act-000000/action.md",
      before = await readFile(join(root, path));
    const app = await launchConfiguredApp({
      args: [resolve("."), `--project=${root}`],
      env: { ...environment(), VOIDRA_DATA_DIR: join(temp, "data") },
    });
    try {
      const page = await app.firstWindow();
      await page.locator('[data-app-ready="true"]').waitFor();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      await page.getByRole("tab", { name: "General", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("heading", {
          name: "Planning files needing attention",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Open affected task", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: "Queue for agent", exact: true }),
      ).toBeDisabled();
      expect(
        (await new AxeBuilder({ page }).setLegacyMode(true).analyze())
          .violations,
      ).toEqual([]);
      await page
        .getByRole("button", { name: "Back to Tasks", exact: true })
        .click();
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await page.getByRole("radio", { name: "Normal", exact: true }).check();
      await page
        .getByLabel("Action type", { exact: true })
        .selectOption("docs");
      await page
        .getByLabel("Title", { exact: true })
        .fill("Independent documentation");
      await page
        .getByLabel("Description", { exact: true })
        .fill("An unrelated planning action");
      await page
        .getByRole("button", { name: "Create action", exact: true })
        .click();
      await expect(
        page.getByText("Action created", { exact: true }),
      ).toBeVisible();
      expect(await readFile(join(root, path))).toEqual(before);
      await writeFile(
        join(root, path),
        before
          .toString()
          .replace(
            /<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n/,
            "Resolved by teammate\n",
          ),
      );
      await expect(
        page.getByRole("heading", {
          name: "Conflicted planning files",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "An action", exact: true }),
      ).toBeVisible();
    } finally {
      await app.close();
      await rm(temp, { recursive: true, force: true });
    }
  });

test("refreshes action details after an actual teammate push and local pull", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-pull-ui-")),
    root = join(temp, "project"),
    remote = join(temp, "remote.git"),
    teammate = join(temp, "teammate");
  await cp(resolve("../../fixtures/new-project/project"), root, {
    recursive: true,
  });
  const id = await createAction(root, {
    type: "docs",
    title: "Before pull",
    description: "Team documentation",
    by: "You",
  });
  const git = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" });
  git(temp, ["init", "--bare", "-q", remote]);
  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "Tests"],
    ["config", "user.email", "tests@example.test"],
    ["add", "."],
    ["commit", "-qm", "Initial planning"],
    ["remote", "add", "origin", remote],
    ["push", "-qu", "origin", "main"],
  ])
    git(root, args);
  git(temp, ["clone", "-q", remote, teammate]);
  git(teammate, ["config", "user.name", "Teammate"]);
  git(teammate, ["config", "user.email", "teammate@example.test"]);
  const app = await launchConfiguredApp({
    args: [resolve("."), `--project=${root}`],
    env: { ...environment(), VOIDRA_DATA_DIR: join(temp, "data") },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    await page
      .getByRole("button", { name: "Before pull", exact: true })
      .click();
    const path = `.voidra/actions/${id}/action.md`,
      doc = parseRecord(path, await readFile(join(teammate, path)));
    await writeFile(
      join(teammate, path),
      serializeRecord(doc, { ...doc.data, title: "After pull" }),
    );
    git(teammate, ["add", path]);
    git(teammate, ["commit", "-qm", "Update team planning"]);
    git(teammate, ["push", "-q", "origin", "main"]);
    git(root, ["pull", "-q", "--ff-only"]);
    await expect(
      page.getByRole("heading", { name: "After pull", exact: true }),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
