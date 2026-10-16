import {
  type ChildProcess,
  execFile,
  execFileSync,
  spawn,
} from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import {
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { checkProject, createAction, readActionSequence } from "voidra";
import { launchConfiguredApp } from "./helpers/configured-app.ts";
import { openExecutionOptions } from "./helpers/execution.ts";

const execute = promisify(execFile),
  repository = resolve("../.."),
  fake = join(repository, "tools/fake-agent/src/cli-entry.ts"),
  runtime = join(repository, "skills/voidra-go/scripts/runtime.mjs");
let app: ElectronApplication, page: Page, temp: string, root: string;
const children: ChildProcess[] = [];
let baselineCommits = 0;
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
async function queue() {
  await page
    .getByRole("button", { name: "Queue for agent", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Queue for agent", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(
      async () => readActionSequence(await checkProject(root)).pending.length,
    )
    .toBeGreaterThan(0);
}
async function scenario(name: string) {
  const result = await execute(process.execPath, [fake, root, name], {
    cwd: repository,
  });
  return JSON.parse(result.stdout) as { run: string };
}
async function recover(run: string) {
  await openExecutionOptions(page);
  await page
    .getByRole("complementary", { name: "Actions", exact: true })
    .getByRole("button", { name: "Recover run", exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText()))
    .toBe(`$voidra-go recover run ${run}`);
  await axe();
  // The coding agent performs recovery; the app only copies its narrow command.
  await execute(process.execPath, [
    runtime,
    "recover",
    "--project",
    root,
    "--run",
    run,
  ]);
  await expect(
    page
      .getByRole("complementary", { name: "Actions", exact: true })
      .getByRole("button", { name: "Recover run", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page
    .getByRole("button", { name: "Document installation", exact: true })
    .click();
}
test.beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "voidra-loop-"));
  root = join(temp, "project");
  await mkdir(root);
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
  app = await launchConfiguredApp({
    args: [resolve("."), `--project=${root}`],
    env: { ...env, VOIDRA_DATA_DIR: join(temp, "data") },
  });
  page = await app.firstWindow();
  await page.locator('[data-app-ready="true"]').waitFor();
  await page
    .getByRole("button", { name: "Use General software", exact: true })
    .click();
  await page
    .getByLabel(/What should this project make possible/)
    .fill("Track fixture documentation");
  await page
    .getByRole("button", { name: "Create planning folder", exact: true })
    .click();
  await expect(
    page.getByText("Project profile created", { exact: true }),
  ).toBeVisible();
  // Empty-folder onboarding precedes a real manifest; Bootstrap remains Backlog.
  await writeFile(join(root, "package.json"), '{"version":"1.2.3"}\n');
  execFileSync("git", ["add", "package.json"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Provide the fixture release source"], {
    cwd: root,
  });
  baselineCommits = Number(
    execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  );
  await expect(
    page.getByRole("option", { name: "Current · 1.2.3", exact: true }),
  ).toHaveCount(1);
  // Retained legacy runtime/recovery contract; the new capture/Planning/QA journey has its own real-window matrix.
  await createAction(root, {
    type: "docs",
    title: "Document installation",
    description: "Document installation in README.md and check the wording.",
    taskColumn: "todo",
    by: "Fixture",
  });
  await expect(
    page
      .getByRole("region", { name: "TODO tasks", exact: true })
      .getByRole("button", { name: "Document installation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Document installation", exact: true })
    .click();
});
test.afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
  }
  await app?.close();
  await rm(temp, { recursive: true, force: true, maxRetries: 3 });
});
for (const theme of ["light", "dark"])
  test(`M1 create, queue, reject, rework and accept in ${theme}`, async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Appearance", exact: true }).click();
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await page.keyboard.press("Escape");
    await axe();
    await queue();
    await openExecutionOptions(page);
    for (const [name, command] of [
      ["Claude Code", "/voidra-go"],
      ["Codex", "$voidra-go"],
    ] as const) {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("radio", { name: name, exact: true }).check();
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: `Voidra Go · ${name}`, exact: true })
        .click();
      await expect
        .poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText()))
        .toBe(command);
    }
    await axe();
    await page.getByRole("button", { name: "Tasks", exact: true }).click();
    await page
      .getByRole("button", { name: "Document installation", exact: true })
      .click();
    const first = await scenario("success");
    await expect(
      page.getByRole("button", { name: "Accept", exact: true }),
    ).toBeEnabled();
    await axe();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page
      .getByLabel("Feedback", { exact: true })
      .fill("Add troubleshooting advice for failed installation.");
    await axe();
    await page
      .getByRole("button", { name: "Send back to Implement", exact: true })
      .click();
    await expect(
      page.getByText("Sent back for changes", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Add troubleshooting advice for failed installation.", {
        exact: true,
      }),
    ).toBeVisible();
    await queue();
    const second = await scenario("success");
    expect(second.run).not.toBe(first.run);
    await expect(
      page.getByRole("button", { name: "Accept", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText(
        "Added troubleshooting guidance from the review feedback.",
        { exact: true },
      ),
    ).toBeVisible();
    await axe();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.locator(".action-meta")).toContainText("Done");
    await expect(page.locator(".action-meta")).toContainText("Done");
    await axe();
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe(String(baselineCommits + 2));
    const log = execFileSync("git", ["log", "-2", "--format=%B"], {
      cwd: root,
      encoding: "utf8",
    });
    for (const run of [first.run, second.run])
      expect(log).toContain(`Voidra-Run: ${run}`);
    expect(log.match(/Voidra-Action:/g)).toHaveLength(2);
  });
test("invalid agent output shows the action path and field", async () => {
  await queue();
  await scenario("invalid-write");
  await expect(
    page.getByRole("heading", { name: "Action file needs attention" }),
  ).toBeVisible();
  const problems = page.getByRole("region", { name: "Planning file problems" });
  await expect(problems).toContainText("action.md:2 · id");
  await axe();
  await page
    .getByRole("button", { name: "Back to Tasks", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Planning problems", exact: true })
    .getByRole("button", { name: "Open affected task", exact: true })
    .first()
    .click();
  await expect(problems).toBeVisible();
});
for (const failure of ["crash-mid-run", "crash-after-commit", "stale-lock"])
  test(`${failure} recovers without a duplicate commit`, async () => {
    await queue();
    const { run } = await scenario(failure);
    await expect(
      page.getByRole("region", { name: "Run recovery" }),
    ).toContainText(/completed result|not finalized/);
    await expect(page.locator(".action-meta")).toContainText("Implement");
    await expect(
      page.getByRole("button", { name: "Accept", exact: true }),
    ).toHaveCount(0);
    await recover(run);
    if (failure === "crash-after-commit") {
      await expect(
        page.getByRole("button", { name: "Accept", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(page.locator(".action-meta")).toContainText("Done");
    } else
      await expect(
        page.getByRole("button", { name: "Queue for agent", exact: true }),
      ).toBeEnabled();
    await execute(process.execPath, [
      runtime,
      "recover",
      "--project",
      root,
      "--run",
      run,
    ]);
    expect(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe(
      String(baselineCommits + (failure === "crash-after-commit" ? 1 : 0)),
    );
    expect((await checkProject(root)).diagnostics).toEqual([]);
  });
test("a live owner with an old heartbeat blocks recovery and competing starts", async () => {
  await queue();
  const child = spawn(process.execPath, [fake, root, "live-stale"], {
    cwd: repository,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const output = await new Promise<string>((resolveOutput, reject) => {
    child.stdout?.once("data", (b) => resolveOutput(String(b)));
    child.once("error", reject);
  });
  const { run } = JSON.parse(output) as { run: string };
  await openExecutionOptions(page);
  await expect(
    page.getByRole("region", { name: "Agent status" }),
  ).toContainText("owner is still alive");
  await expect(
    page
      .getByRole("complementary", { name: "Actions", exact: true })
      .getByRole("button", { name: "Recover run", exact: true }),
  ).toBeDisabled();
  const lock = await readFile(join(root, ".voidra/local/run.lock"), "utf8");
  await expect(scenario("success")).rejects.toThrow();
  await expect(
    execute(process.execPath, [
      runtime,
      "recover",
      "--project",
      root,
      "--run",
      run,
    ]),
  ).rejects.toThrow();
  expect(await readFile(join(root, ".voidra/local/run.lock"), "utf8")).toBe(
    lock,
  );
  await axe();
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  await recover(run);
});
test("an interrupted grouped write holds the last complete action until explicit recovery", async () => {
  await queue();
  const { run } = await scenario("interrupted-operation");
  await expect(
    page.getByRole("region", { name: "Planning file problems" }),
  ).toContainText("Incomplete operation");
  await expect(
    page.getByRole("heading", { name: "Document installation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Unfinished fixture operation",
      exact: true,
    }),
  ).toHaveCount(0);
  const pending = [...(await checkProject(root)).records.values()].find(
    (o) => o.kind === "operation" && o.document.data.state === "prepared",
  );
  if (!pending) throw new Error("Expected unfinished operation");
  await openExecutionOptions(page);
  await page
    .getByRole("complementary", { name: "Actions", exact: true })
    .getByRole("button", { name: "Recover write", exact: true })
    .click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText()))
    .toBe(`$voidra-go recover operation ${String(pending.document.data.id)}`);
  await axe();
  await execute(process.execPath, [
    join(repository, "packages/voidra/dist/cli-entry.js"),
    "recover",
    String(pending.document.data.id),
    "--project",
    root,
    "--rollback",
    "--json",
  ]);
  await expect(
    page.getByRole("button", { name: "Recover write", exact: true }),
  ).toHaveCount(0);
  await recover(run);
  expect((await checkProject(root)).diagnostics).toEqual([]);
  const checked = await checkProject(root),
    action = [...checked.records.values()].find(
      (r) => r.kind === "action" && r.document.data.type === "docs",
    );
  expect(action?.document.data.title).toBe("Document installation");
});
