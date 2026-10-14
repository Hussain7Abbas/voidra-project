import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import {
  _electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { checkProject, replaceActionQueue } from "voidra";
import {
  publishPlanning,
  startRun,
} from "../../../tools/run-engine/src/run.ts";

const execute = promisify(execFile);
let app: ElectronApplication, page: Page, temp: string, root: string;
async function start(existing = false) {
  temp = await mkdtemp(join(tmpdir(), "voidra-profile-flow-"));
  root = join(temp, "project");
  if (existing)
    await cp(resolve("../../fixtures/existing-code/project"), root, {
      recursive: true,
    });
  else await mkdir(root);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined &&
        !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(p[0]),
    ),
  );
  app = await _electron.launch({
    args: [resolve("."), `--project=${root}`],
    env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
  });
  page = await app.firstWindow();
  await page.locator('[data-app-ready="true"]').waitFor();
}
async function axe() {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).every((b) =>
      b.getAnimations().every((a) => a.playState !== "running"),
    ),
  );
  expect(
    (await new AxeBuilder({ page }).setLegacyMode(true).analyze()).violations,
  ).toEqual([]);
}
async function theme(value: string) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption(value);
  await page.keyboard.press("Escape");
}
test.afterEach(async () => {
  await app?.close();
  await rm(temp, { recursive: true, force: true, maxRetries: 3 });
});
for (const value of ["light", "dark"])
  test(`new-project onboarding and profile edits in ${value}`, async () => {
    await start();
    await theme(value);
    await axe();
    await page
      .getByRole("button", { name: "Use General software", exact: true })
      .click();
    await axe();
    await page.screenshot({
      path: resolve(`../../.cache/screenshots/p04-onboarding-${value}.png`),
    });
    await page
      .getByLabel(/What should this project make possible/)
      .fill("Track useful work");
    await page.getByLabel(/Who will use it/).fill("Independent developers");
    await page
      .getByLabel(/What are the first useful features/)
      .fill("Create projects\nTrack actions");
    await page.getByRole("radio", { name: "Desktop app", exact: true }).check();
    await page
      .getByRole("checkbox", { name: "Simplicity", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Accessibility", exact: true })
      .check();
    await page
      .getByLabel(/Which technologies are already chosen/)
      .fill("TypeScript");
    await page
      .getByRole("button", { name: "Create planning folder", exact: true })
      .click();
    await expect(
      page.getByText("Project profile created", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();
    await axe();
    await page.screenshot({
      path: resolve(`../../.cache/screenshots/p04-profile-${value}.png`),
    });
    await expect(
      page.getByText("Track useful work", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Edit What should this project make possible?",
        exact: true,
      })
      .click();
    await axe();
    await page
      .getByLabel(/What should this project make possible/)
      .fill("Track project decisions too");
    await page
      .getByRole("button", { name: "Save answer", exact: true })
      .click();
    await expect(
      page.getByText("Profile answer saved", { exact: true }),
    ).toBeVisible();
    const checked = await checkProject(root);
    expect(checked.diagnostics).toEqual([]);
    expect(
      [...checked.records.values()].filter(
        (r) => r.kind === "action" && r.document.data.type === "profile-change",
      ),
    ).toHaveLength(1);
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Bootstrap", exact: true }),
    ).toBeVisible();
    await axe();
    // The actual onboarding result must reach its standalone Plan gate without Git setup.
    const bootstrap = [...checked.records.values()].find(
      (r) => r.kind === "action" && r.document.data.title === "Bootstrap",
    );
    const id = String(bootstrap?.document.data.id);
    await replaceActionQueue(root, {
      ids: [id],
      revision: null,
      by: "Verification owner",
    });
    const run = await startRun(root, "codex", process.pid, "plan");
    if (!run) throw new Error("Missing Bootstrap planning run");
    await publishPlanning(root, run.ownerToken, {
      action: id,
      kind: "plan",
      requirements:
        "## Goal\nTrack useful work locally.\n## Out of scope\nRemote services.\n",
      blueprint:
        "## Approach\nBootstrap after approval.\n## Testing seams\nLocal workflow.\n## Proposed ADRs\nNone.\n",
      acceptance: "- Local behavior works.\n",
    });
    await page.getByRole("button", { name: "Bootstrap", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Approve plan", exact: true }),
    ).toBeEnabled();
    expect((await checkProject(root)).diagnostics).toEqual([]);
    await expect(readFile(join(root, ".git/HEAD"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await axe();
  });
for (const value of ["light", "dark"])
  test(`existing-project commands and manual intake in ${value}`, async () => {
    await start(true);
    await theme(value);
    await expect(
      page.getByRole("heading", {
        name: "Bring this codebase into Voidra",
        exact: true,
      }),
    ).toBeVisible();
    await axe();
    for (const [agent, command] of [
      ["Claude Code", "/voidra-init"],
      ["Codex", "$voidra-init"],
    ]) {
      await page
        .getByRole("button", {
          name: `Copy ${agent} setup command`,
          exact: true,
        })
        .click();
      await expect
        .poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText()))
        .toBe(command);
    }
    await page
      .getByRole("button", { name: "Fill in by hand", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Use General software", exact: true })
      .click();
    await page
      .getByLabel(/What should this project make possible/)
      .fill("Explain the existing greeting");
    await page
      .getByRole("button", { name: "Create planning folder", exact: true })
      .click();
    await expect(
      page.getByText("Project profile created", { exact: true }),
    ).toBeVisible();
    expect(
      [...(await checkProject(root)).records.values()].filter(
        (r) => r.kind === "action",
      ),
    ).toHaveLength(0);
    expect(await readFile(join(root, "src/app.ts"), "utf8")).toBe(
      'export const greeting = "Hello";\n',
    );
  });
for (const value of ["light", "dark"])
  test(`fake init, inferred confirmation and linked profile draft in ${value}`, async () => {
    await start(true);
    await theme(value);
    await execute(
      process.execPath,
      [resolve("../../tools/fake-agent/src/cli-entry.ts"), root, "init"],
      { cwd: resolve("../..") },
    );
    await page
      .getByRole("button", { name: "Waiting for you", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Inferred profile answers" }),
    ).toBeVisible();
    await axe();
    await page
      .getByRole("button", {
        name: "Confirm What should this project make possible?",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Answer confirmed", { exact: true }),
    ).toBeVisible();
    const block = (await checkProject(root)).records.get(
      ".voidra/profile/problem.md",
    )?.document.data;
    expect(block?.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "confirmed",
          confirmedBy: "You",
          updatedAt: expect.any(String),
        }),
      ]),
    );
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Edit What should this project make possible?",
        exact: true,
      })
      .click();
    await page
      .getByLabel(/What should this project make possible/)
      .fill("A revised greeting project");
    await page
      .getByRole("button", { name: "Save answer", exact: true })
      .click();
    await expect(
      page.getByText("Profile answer saved", { exact: true }),
    ).toBeVisible();
    await axe();
    expect((await checkProject(root)).diagnostics).toEqual([]);
  });
