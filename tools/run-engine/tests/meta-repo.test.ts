import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject } from "voidra";
import {
  commitResult,
  failRun,
  finalizeResult,
  guardRun,
  prepareResult,
  publishHumanBlocker,
  recoverRun,
  runContext,
  startRun,
} from "../src/run.ts";
import { fixture, report } from "./helpers.ts";

const git = (root: string, args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
async function metaFixture(type: "docs" | "feature" = "docs") {
  const root = await fixture(type),
    source = await mkdtemp(join(tmpdir(), "voidra-submodule-source-"));
  await writeFile(join(source, "title.ts"), 'export const title = "Draft";\n');
  await writeFile(join(source, "user.txt"), "Keep user data\n");
  git(source, ["init", "-q"]);
  for (const [key, value] of [
    ["user.name", "Voidra Verification"],
    ["user.email", "verification@example.test"],
  ])
    git(source, ["config", key as string, value as string]);
  git(source, ["add", "."]);
  git(source, ["commit", "-qm", "Extension baseline"]);
  git(root, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "-q",
    source,
    "components/extension",
  ]);
  const child = join(root, "components/extension");
  for (const [key, value] of [
    ["user.name", "Voidra Verification"],
    ["user.email", "verification@example.test"],
  ])
    git(child, ["config", key as string, value as string]);
  git(root, ["commit", "-qm", "Track extension submodule"]);
  return { root, child, source };
}

it("starts with a dirty submodule without reading a directory as text and protects existing child edits", async () => {
  const { root, child, source } = await metaFixture();
  try {
    await writeFile(join(child, "user.txt"), "Uncommitted user changes\n");
    git(child, ["add", "user.txt"]);
    const before = git(child, ["diff", "--cached"]);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Missing queued meta-repo task");
    await expect(
      guardRun(root, ctx.ownerToken, ["components/extension/user.txt"]),
    ).rejects.toThrow(/pre-existing|overlap/i);
    await guardRun(root, ctx.ownerToken, ["components/extension/title.ts"]);
    expect(git(child, ["diff", "--cached"])).toBe(before);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("commits selected child files and the parent gitlink once, preserving unrelated staging in both repositories", async () => {
  const { root, child, source } = await metaFixture();
  try {
    await writeFile(join(child, "user.txt"), "Unrelated staged child edit\n");
    git(child, ["add", "user.txt"]);
    await writeFile(join(root, "user-root.txt"), "Unrelated parent edit\n");
    git(root, ["add", "user-root.txt"]);
    const childIndex = git(child, ["diff", "--cached"]),
      rootIndex = git(root, ["diff", "--cached"]),
      childBase = git(child, ["rev-parse", "HEAD"]);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Missing queued meta-repo task");
    const path = "components/extension/title.ts";
    await guardRun(root, ctx.ownerToken, [path]);
    await writeFile(join(root, path), 'export const title = "Draft title";\n');
    await prepareResult(root, ctx.ownerToken, { ...report, paths: [path] });
    const commit = await commitResult(root, ctx.ownerToken, "Fix draft title");
    expect(await commitResult(root, ctx.ownerToken, "Fix draft title")).toBe(
      commit,
    );
    await expect(
      failRun(root, ctx.ownerToken, "Abandon committed chain"),
    ).rejects.toThrow(/recover|intent/i);
    const childCommit = git(child, ["rev-parse", "HEAD"]);
    expect(childCommit).not.toBe(childBase);
    expect(git(child, ["show", "--format=%B", "--no-patch", "HEAD"])).toContain(
      `Voidra-Run: ${ctx.run}`,
    );
    expect(git(root, ["ls-tree", "HEAD", "components/extension"])).toContain(
      childCommit,
    );
    expect(git(child, ["show", "HEAD:user.txt"])).toBe("Keep user data");
    await finalizeResult(root, ctx.ownerToken);
    expect(git(child, ["diff", "--cached"])).toBe(childIndex);
    expect(git(root, ["diff", "--cached"])).toBe(rootIndex);
    expect(git(child, ["diff", "--name-only"])).toBe("");
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(await readFile(join(root, ctx.runPath), "utf8")).toContain(
      childCommit,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("commits nested submodules deepest first and records both child receipts", async () => {
  const { root, child, source } = await metaFixture();
  try {
    git(child, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      "-q",
      source,
      "nested/inner",
    ]);
    const inner = join(child, "nested/inner");
    git(inner, ["config", "user.name", "Voidra Verification"]);
    git(inner, ["config", "user.email", "verification@example.test"]);
    git(child, ["commit", "-qm", "Track nested module"]);
    git(root, ["add", "components/extension"]);
    git(root, ["commit", "-qm", "Record nested baseline"]);
    const ctx = await startRun(root, "claude-code", process.pid);
    if (!ctx) throw Error("Missing run");
    const path = "components/extension/nested/inner/title.ts";
    await guardRun(root, ctx.ownerToken, [path]);
    await writeFile(join(root, path), 'export const title = "Nested draft";\n');
    await prepareResult(root, ctx.ownerToken, { ...report, paths: [path] });
    await commitResult(root, ctx.ownerToken, "Fix nested draft");
    await finalizeResult(root, ctx.ownerToken);
    const innerHead = git(inner, ["rev-parse", "HEAD"]),
      childHead = git(child, ["rev-parse", "HEAD"]);
    expect(git(child, ["ls-tree", "HEAD", "nested/inner"])).toContain(
      innerHead,
    );
    expect(git(root, ["ls-tree", "HEAD", "components/extension"])).toContain(
      childHead,
    );
    expect(git(child, ["status", "--porcelain"])).toBe("");
    const final = await runContext(root, ctx.run);
    expect(final.submoduleCommits?.map((module) => module.path)).toEqual([
      "components/extension/nested/inner",
      "components/extension",
    ]);
    expect(
      final.submoduleCommits?.every((module) => module.indexReconciled),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("reconciles a child commit after interruption without duplicating it or abandoning its intent", async () => {
  const { root, child, source } = await metaFixture();
  const owner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
  });
  try {
    if (!owner.pid) throw Error("Missing owner process");
    const ctx = await startRun(root, "codex", owner.pid);
    if (!ctx) throw Error("Missing run");
    const path = "components/extension/title.ts",
      before = git(root, ["rev-parse", "HEAD"]);
    await writeFile(
      join(root, path),
      'export const title = "Recovered draft";\n',
    );
    await prepareResult(root, ctx.ownerToken, { ...report, paths: [path] });
    await expect(
      commitResult(root, ctx.ownerToken, "Fix draft", {
        checkpoint: (point) => {
          if (point.startsWith("after-submodule-commit:"))
            throw Error("Simulated interruption");
        },
      }),
    ).rejects.toThrow(/interruption/);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
    const childHead = git(child, ["rev-parse", "HEAD"]),
      count = git(child, ["rev-list", "--count", "HEAD"]);
    await expect(failRun(root, ctx.ownerToken, "Abandon")).rejects.toThrow(
      /recover|intent/i,
    );
    const exited = once(owner, "exit");
    owner.kill("SIGKILL");
    await exited;
    const recovered = await recoverRun(root, ctx.run);
    expect(recovered.phase).toBe("finalized");
    expect(await recoverRun(root, ctx.run)).toEqual(recovered);
    expect(git(child, ["rev-parse", "HEAD"])).toBe(childHead);
    expect(git(child, ["rev-list", "--count", "HEAD"])).toBe(count);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    owner.kill();
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("keeps uninitialized submodules untouched and refuses their files with an actionable message", async () => {
  const { root, source } = await metaFixture();
  try {
    git(root, ["submodule", "deinit", "-f", "--", "components/extension"]);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Missing run");
    await guardRun(root, ctx.ownerToken, ["README.md"]);
    await expect(
      guardRun(root, ctx.ownerToken, ["components/extension/title.ts"]),
    ).rejects.toThrow(/initialize/i);
    expect(git(root, ["submodule", "status"])).toMatch(/^-/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("protects changed child pointers and child source, HEADs and tags in planning-only runs", async () => {
  const { root, child, source } = await metaFixture("feature");
  try {
    const ctx = await startRun(root, "codex", process.pid, "plan");
    if (!ctx) throw Error("Missing run");
    const input = {
      title: "Need input",
      description: "Ask the owner",
      steps: ["Decide"],
    };
    await writeFile(join(child, "title.ts"), "Changed during planning\n");
    await expect(
      publishHumanBlocker(root, ctx.ownerToken, input),
    ).rejects.toThrow(/planning changed/i);
    git(child, ["restore", "title.ts"]);
    git(child, ["tag", "outside-tag"]);
    await expect(
      publishHumanBlocker(root, ctx.ownerToken, input),
    ).rejects.toThrow(/tags|changed/i);
    git(child, ["tag", "-d", "outside-tag"]);
    git(child, ["commit", "--allow-empty", "-qm", "Outside child commit"]);
    await expect(
      publishHumanBlocker(root, ctx.ownerToken, input),
    ).rejects.toThrow(/HEAD|changed/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("does not absorb a pre-existing child commit or commit during a child's existing Git operation", async () => {
  const { root, child, source } = await metaFixture();
  try {
    git(child, [
      "commit",
      "--allow-empty",
      "-qm",
      "User's existing child commit",
    ]);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Missing run");
    await expect(
      guardRun(root, ctx.ownerToken, ["components/extension/title.ts"]),
    ).rejects.toThrow(/existing submodule pointer/);
    await guardRun(root, ctx.ownerToken, ["README.md"]);
    await failRun(root, ctx.ownerToken, "Record existing pointer first");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
  const next = await metaFixture();
  try {
    const ctx = await startRun(next.root, "codex", process.pid);
    if (!ctx) throw Error("Missing run");
    const path = "components/extension/title.ts";
    await writeFile(join(next.root, path), 'export const title = "Changed";\n');
    const marker = git(next.child, ["rev-parse", "--git-path", "MERGE_HEAD"]);
    await writeFile(
      resolve(next.child, marker),
      `${git(next.child, ["rev-parse", "HEAD"])}\n`,
    );
    await expect(
      prepareResult(next.root, ctx.ownerToken, { ...report, paths: [path] }),
    ).rejects.toThrow(/existing Git operation/);
  } finally {
    await rm(next.root, { recursive: true, force: true });
    await rm(next.source, { recursive: true, force: true });
  }
});

it("refuses a changed selected child index before any commit and preserves the conflicting stage", async () => {
  const { root, child, source } = await metaFixture();
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Missing run");
    const path = "components/extension/title.ts";
    await writeFile(join(root, path), 'export const title = "Changed";\n');
    await prepareResult(root, ctx.ownerToken, { ...report, paths: [path] });
    git(child, ["add", "title.ts"]);
    const staged = git(child, ["diff", "--cached"]),
      before = git(child, ["rev-parse", "HEAD"]);
    await expect(
      commitResult(root, ctx.ownerToken, "Change title"),
    ).rejects.toThrow(/index changed/i);
    expect(git(child, ["diff", "--cached"])).toBe(staged);
    expect(git(child, ["rev-parse", "HEAD"])).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("refuses outside gitlink staging after preparation and does not overwrite it", async () => {
  const { root, child, source } = await metaFixture();
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Missing run");
    const path = "components/extension/title.ts";
    await writeFile(join(root, path), 'export const title = "Changed";\n');
    await prepareResult(root, ctx.ownerToken, { ...report, paths: [path] });
    const object = git(child, ["rev-parse", "HEAD^{tree}"]);
    git(root, [
      "update-index",
      "--cacheinfo",
      "160000",
      object,
      "components/extension",
    ]);
    const staged = git(root, ["ls-files", "--stage", "components/extension"]);
    const before = git(child, ["rev-parse", "HEAD"]);
    await expect(
      commitResult(root, ctx.ownerToken, "Change title"),
    ).rejects.toThrow(/Submodule.*changed/);
    expect(git(root, ["ls-files", "--stage", "components/extension"])).toBe(
      staged,
    );
    expect(git(child, ["rev-parse", "HEAD"])).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

it("supports old-form submodules with embedded Git directories without treating Git metadata as source", async () => {
  const { root, child, source } = await metaFixture("feature");
  try {
    await rm(child, { recursive: true, force: true });
    git(root, ["clone", "--no-hardlinks", "-q", source, child]);
    const ctx = await startRun(root, "codex", process.pid, "plan");
    if (!ctx) throw Error("Missing run");
    expect(
      Object.keys(ctx.sourceSnapshot ?? {}).some((path) =>
        path.includes("/.git/"),
      ),
    ).toBe(false);
    git(child, ["config", "test.private", "changed metadata"]);
    await publishHumanBlocker(root, ctx.ownerToken, {
      title: "Need input",
      description: "Ask the owner",
      steps: ["Decide"],
    });
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});
