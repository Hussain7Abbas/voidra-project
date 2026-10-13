import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { createAction } from "voidra";
import type { BridgeRequest } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("shows tagged commits and opens only a current verified GitHub link through the main boundary", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-history-service-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const id = await createAction(root, {
    type: "docs",
    title: "Document export",
    description: "Document the export",
    by: "You",
  });
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Tests"],
    ["config", "user.email", "tests@example.test"],
    ["add", "."],
    ["commit", "-qm", "Document export\n\nVoidra-Action: " + id],
    ["remote", "add", "origin", "https://github.com/Owner/project.git"],
  ])
    git(args);
  const commit = git(["rev-parse", "HEAD"]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined && p[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const app = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${root}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: join(temp, "data"),
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const invoke = (request: BridgeRequest) =>
      page.evaluate(
        (raw: string) => window.voidra.invoke(JSON.parse(raw) as never),
        JSON.stringify(request),
      );
    const result = await invoke({ command: "workspace" });
    if (!result.ok || result.data.kind !== "workspace")
      throw new Error("Missing snapshot");
    expect(result.data.workspace.history.commits[0]?.actions).toEqual([id]);
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        (globalThis as unknown as { opened: string }).opened = url;
      };
    });
    expect(
      (await invoke({ command: "open-commit", hash: "0".repeat(40) })).ok,
    ).toBe(false);
    await page
      .getByRole("button", { name: "Document export", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `Open ${commit.slice(0, 7)} on GitHub`,
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as unknown as { opened: string }).opened,
        ),
      )
      .toBe(`https://github.com/Owner/project/commit/${commit}`);
    git(["remote", "set-url", "origin", "https://github.com.evil.test/o/r"]);
    expect((await invoke({ command: "open-commit", hash: commit })).ok).toBe(
      false,
    );
    git(["commit", "--allow-empty", "-qm", "Outside change"]);
    const updated = await invoke({ command: "workspace" });
    if (!updated.ok || updated.data.kind !== "workspace")
      throw new Error("Missing snapshot");
    expect(updated.data.workspace.history.commits[0]?.actions).toEqual([]);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
