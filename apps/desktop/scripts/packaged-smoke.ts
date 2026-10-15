import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { parseRecord, serializeRecord } from "voidra";
import { processIdentity } from "../../../tools/run-engine/src/lock.ts";
import { verifyPackagedSkills } from "./packaged-skills.ts";

const root = await mkdtemp(join(tmpdir(), "voidra-packaged-"));
const appRoot =
  process.env.VOIDRA_SMOKE_APP_PATH ??
  resolve("release/mac-arm64/Voidra Project.app");
const project = join(root, "project");
await cp(resolve("../../fixtures/new-project/project"), project, {
  recursive: true,
});
await writeFile(join(project, "package.json"), '{"version":"1.2.3"}\n');
const actionPath = ".voidra/actions/act-000000/action.md";
const action = parseRecord(
  actionPath,
  await readFile(join(project, actionPath)),
);
await writeFile(
  join(project, actionPath),
  serializeRecord(action, { ...action.data, status: "running" }),
);
const at = new Date().toISOString(),
  runPath =
    ".voidra/actions/act-000000/runs/2026-10-13T000000Z-codex-run-000000.md";
await mkdir(join(project, ".voidra/actions/act-000000/runs"), {
  recursive: true,
});
await writeFile(
  join(project, runPath),
  serializeRecord(
    parseRecord(runPath, "---\n{}\n---\n"),
    {
      id: "run-000000",
      action: "act-000000",
      agent: "codex",
      startedAt: at,
      fromStage: "discovery",
      outcome: "running",
      consumedRecords: ["act-000000"],
    },
    "Packaged ownership probe.\n",
  ),
);
await mkdir(join(project, ".voidra/local"), { recursive: true });
await writeFile(
  join(project, ".voidra/local/run.lock"),
  JSON.stringify({
    ownerToken: "packaged-probe",
    pid: process.pid,
    processStartedAt: await processIdentity(process.pid),
    agent: "codex",
    host: hostname(),
    run: "run-000000",
    action: "act-000000",
    startedAt: at,
    heartbeatAt: at,
  }),
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (pair): pair is [string, string] =>
      pair[1] !== undefined &&
      !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
  ),
);
const application = await _electron.launch({
  executablePath: join(appRoot, "Contents/MacOS/Voidra Project"),
  args: [`--project=${project}`],
  env: { ...env, VOIDRA_DATA_DIR: root },
});
try {
  const page = await application.firstWindow();
  await page.locator('[data-app-ready="true"]').waitFor();
  assert.equal(page.url(), "app://voidra-project/");
  assert.equal(await page.evaluate(() => window.voidra.sandboxed), true);
  const result = await page.evaluate(() =>
    window.voidra.invoke({ command: "snapshot" }),
  );
  assert.ok(
    result.ok && result.data.kind === "snapshot" && result.data.project,
  );
  if (result.ok && result.data.kind === "snapshot")
    assert.match(result.data.project?.sqliteVersion ?? "", /^\d+\.\d+\.\d+$/);
  const releaseOptions = await page.evaluate(() =>
    window.voidra.invoke({ command: "release-options" }),
  );
  assert.ok(
    releaseOptions.ok && releaseOptions.data.kind === "release-options",
  );
  if (releaseOptions.ok && releaseOptions.data.kind === "release-options") {
    assert.deepEqual(
      releaseOptions.data.choices.map((choice) => choice.version),
      ["1.2.4", "1.3.0", "2.0.0"],
    );
    assert.equal(releaseOptions.data.source.version, "1.2.3");
  }
  assert.equal(
    await readFile(join(project, "package.json"), "utf8"),
    '{"version":"1.2.3"}\n',
  );
  const workspace = await page.evaluate(() =>
    window.voidra.invoke({ command: "workspace" }),
  );
  assert.ok(workspace.ok && workspace.data.kind === "workspace");
  if (workspace.ok && workspace.data.kind === "workspace") {
    assert.deepEqual(workspace.data.workspace.diagnostics, []);
    assert.equal(workspace.data.workspace.lock.state, "running");
    assert.ok(
      workspace.data.workspace.templates.some(
        (template) => template.id === "general" && template.blocks.length > 0,
      ),
    );
  }
  const runtime = await application.evaluate(() => ({
    electron: process.versions.electron,
    node: process.versions.node,
    abi: process.versions.modules,
    arch: process.arch,
  }));
  process.stdout.write(`${JSON.stringify(runtime)}\n`);
  await verifyPackagedSkills(
    join(appRoot, "Contents/MacOS/Voidra Project"),
    join(appRoot, "Contents/Resources/app.asar/dist/skills"),
    root,
  );
  await page.screenshot({
    path: resolve("../../.cache/screenshots/p02-packaged.png"),
  });
  process.stdout.write(
    "Packaged arm64 app rendered, with sandboxed preload, native SQLite and unpacked process ownership helper verified in its utility process.\n",
  );
} finally {
  await application.close();
  await rm(root, { recursive: true, force: true });
}
