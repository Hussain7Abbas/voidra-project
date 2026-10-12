import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";

const root = await mkdtemp(join(tmpdir(), "voidra-packaged-"));
const project = join(root, "project");
await mkdir(project);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (pair): pair is [string, string] =>
      pair[1] !== undefined &&
      !["ELECTRON_RUN_AS_NODE", "NODE_V8_COVERAGE"].includes(pair[0]),
  ),
);
const application = await _electron.launch({
  executablePath: resolve(
    "release/mac-arm64/Voidra Project.app/Contents/MacOS/Voidra Project",
  ),
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
  const runtime = await application.evaluate(() => ({
    electron: process.versions.electron,
    node: process.versions.node,
    abi: process.versions.modules,
    arch: process.arch,
  }));
  process.stdout.write(`${JSON.stringify(runtime)}\n`);
  await page.screenshot({
    path: resolve("../../.cache/screenshots/p02-packaged.png"),
  });
  process.stdout.write(
    "Packaged arm64 app rendered, with sandboxed preload and native SQLite loaded in its utility process.\n",
  );
} finally {
  await application.close();
  await rm(root, { recursive: true, force: true });
}
