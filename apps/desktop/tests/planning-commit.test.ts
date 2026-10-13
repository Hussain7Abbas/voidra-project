import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import type { BridgeRequest, BridgeResponse } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("previews and commits only explicit shared planning files through the validated service", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-planning-service-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  await writeFile(join(root, "code.txt"), "Source\n");
  for (const args of [
    ["init", "-q"],
    ["config", "user.name", "Tests"],
    ["config", "user.email", "tests@example.test"],
    ["add", "code.txt"],
    ["commit", "-qm", "Initial code"],
  ])
    git(args);
  await writeFile(join(root, "code.txt"), "Staged code\n");
  git(["add", "code.txt"]);
  const before = git(["ls-files", "--stage", "--", "code.txt"]);
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
    const invoke = (request: BridgeRequest): Promise<BridgeResponse> =>
      page.evaluate(
        (raw: string) => window.voidra.invoke(JSON.parse(raw) as never),
        JSON.stringify(request),
      );
    const snapshot = await invoke({ command: "workspace" });
    if (!snapshot.ok || snapshot.data.kind !== "workspace")
      throw new Error("Missing snapshot");
    const preview = snapshot.data.workspace.planning;
    expect(preview.enabled).toBe(true);
    const request: BridgeRequest = {
      command: "commit-planning",
      id: randomUUID(),
      revision: preview.revision,
      paths: preview.files.map((file) => file.path),
      message: "Share planning",
    };
    expect((await invoke({ ...request, paths: ["code.txt"] })).ok).toBe(false);
    expect((await invoke(request)).ok).toBe(true);
    expect(git(["ls-files", "--stage", "--", "code.txt"])).toBe(before);
    const count = git(["rev-list", "--count", "HEAD"]);
    expect((await invoke(request)).ok).toBe(true);
    expect(git(["rev-list", "--count", "HEAD"])).toBe(count);
    expect(
      git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])
        .split("\n")
        .every(
          (path) =>
            path.startsWith(".voidra/") && !path.startsWith(".voidra/local/"),
        ),
    ).toBe(true);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
