import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  commitPlanning,
  discardPlanning,
  pendingPlanning,
  previewPlanning,
  recoverPlanning,
} from "../src/planning-commit.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "voidra-planning-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Tests"]);
  git(["config", "user.email", "tests@example.test"]);
  await writeFile(join(root, "code.txt"), "first\nsecond\n");
  git(["add", "."]);
  git(["commit", "-qm", "Initial code"]);
  await cp(
    resolve("fixtures/new-project/project/.voidra"),
    join(root, ".voidra"),
    { recursive: true },
  );
  return { root, git };
}

it("commits an entirely new planning folder and then only selected new, changed and deleted literal paths", async () => {
  const { root, git } = await fixture();
  try {
    let preview = await previewPlanning(root);
    expect(preview.enabled).toBe(true);
    await commitPlanning(root, {
      id: randomUUID(),
      revision: preview.revision,
      paths: preview.files.map((f) => f.path),
      message: "Add planning",
    });
    await writeFile(join(root, "code.txt"), "staged\nsecond\n");
    git(["add", "code.txt"]);
    await writeFile(join(root, "code.txt"), "staged\nunstaged\n");
    await mkdir(join(root, ".voidra/local"), { recursive: true });
    await writeFile(join(root, ".voidra/local/private.txt"), "private\n");
    git(["add", "--force", ".voidra/local/private.txt"]);
    const before = git([
      "ls-files",
      "--stage",
      "--",
      "code.txt",
      ".voidra/local/private.txt",
    ]);
    const unusual = [
      ".voidra/note with spaces.md",
      ".voidra/:(glob)*.md",
      ".voidra/line\nbreak.md",
    ];
    for (const path of unusual)
      await writeFile(join(root, path), "Planning note\n");
    await writeFile(
      join(root, ".voidra/README.md"),
      "Changed planning guide\n",
    );
    await unlink(join(root, ".voidra/actions/act-000000/action.md"));
    preview = await previewPlanning(root);
    expect(preview.files.some((f) => f.path.startsWith(".voidra/local/"))).toBe(
      false,
    );
    const selected = preview.files
      .map((f) => f.path)
      .filter((path) => !path.endsWith("note with spaces.md"));
    const result = await commitPlanning(root, {
      id: randomUUID(),
      revision: preview.revision,
      paths: selected,
      message: "Update planning",
    });
    expect(result.reconciled).toBe(true);
    expect(
      git([
        "ls-files",
        "--stage",
        "--",
        "code.txt",
        ".voidra/local/private.txt",
      ]),
    ).toBe(before);
    const changed = git([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      result.commit,
    ])
      .split("\0")
      .filter(Boolean);
    expect(changed.sort()).toEqual(selected.sort());
    expect(await readFile(join(root, "code.txt"), "utf8")).toBe(
      "staged\nunstaged\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses empty/nonrepo previews, active runs, merge/rebase state and changed previews", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-notgit-"));
  try {
    expect((await previewPlanning(temp)).reason).toMatch(/repository/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  const { root, git } = await fixture();
  try {
    const preview = await previewPlanning(root);
    for (const path of [
      "code.txt",
      ".voidra/local/private.txt",
      ".voidra/../code.txt",
    ]) {
      await expect(
        commitPlanning(root, {
          id: randomUUID(),
          revision: preview.revision,
          paths: [path],
          message: "Invalid path",
        }),
      ).rejects.toThrow(/shared planning paths/);
    }
    await writeFile(join(root, ".voidra/README.md"), "Concurrent edit\n");
    await expect(
      commitPlanning(root, {
        id: randomUUID(),
        revision: preview.revision,
        paths: preview.files.map((f) => f.path),
        message: "Stale",
      }),
    ).rejects.toThrow(/changed/);
    await mkdir(join(root, ".voidra/local"), { recursive: true });
    await writeFile(join(root, ".voidra/local/run.lock"), "owner");
    expect((await previewPlanning(root)).reason).toMatch(/run/);
    await unlink(join(root, ".voidra/local/run.lock"));
    for (const path of [".git/MERGE_HEAD", ".git/rebase-merge/head-name"]) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), "merge\n");
      expect((await previewPlanning(root)).reason).toMatch(/merge|rebase/);
      await unlink(join(root, path));
      if (path.includes("rebase-merge"))
        await rm(join(root, ".git/rebase-merge"), { recursive: true });
    }
    git(["add", ".voidra"]);
    git(["commit", "-qm", "Planning already shared"]);
    expect((await previewPlanning(root)).reason).toMatch(/Nothing/);
    const empty = await previewPlanning(root);
    await expect(
      commitPlanning(root, {
        id: randomUUID(),
        revision: empty.revision,
        paths: [],
        message: "Empty",
      }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("preserves the main index on hook failure and reconciles an interrupted successful commit without duplication", async () => {
  const { root, git } = await fixture();
  try {
    const preview = await previewPlanning(root),
      paths = preview.files.map((f) => f.path),
      before = git(["ls-files", "--stage"]);
    await writeFile(
      join(root, ".git/hooks/pre-commit"),
      "#!/bin/sh\nexit 1\n",
      { mode: 0o755 },
    );
    await expect(
      commitPlanning(root, {
        id: randomUUID(),
        revision: preview.revision,
        paths,
        message: "Hook failure",
      }),
    ).rejects.toThrow();
    expect(git(["ls-files", "--stage"])).toBe(before);
    await unlink(join(root, ".git/hooks/pre-commit"));
    const id = randomUUID(),
      next = await previewPlanning(root);
    await expect(
      commitPlanning(
        root,
        { id, revision: next.revision, paths, message: "Planning" },
        {
          checkpoint: (point) => {
            if (point === "after-commit") throw new Error("Interrupted");
          },
        },
      ),
    ).rejects.toThrow("Interrupted");
    const fresh = await previewPlanning(root);
    await expect(
      commitPlanning(root, {
        id: randomUUID(),
        revision: fresh.revision,
        paths,
        message: "Do not bypass recovery",
      }),
    ).rejects.toThrow(/previous planning commit/);
    const count = git(["rev-list", "--count", "HEAD"]);
    const result = await commitPlanning(root, {
      id,
      revision: next.revision,
      paths,
      message: "Planning",
    });
    expect(result.reconciled).toBe(true);
    expect(git(["rev-list", "--count", "HEAD"])).toBe(count);
    expect(git(["show", "-s", "--format=%B", result.commit])).toContain(
      `Voidra-Planning: ${id}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses concurrent HEAD/index changes before committing and preserves a selected index conflict after success", async () => {
  const { root, git } = await fixture();
  try {
    let preview = await previewPlanning(root);
    const paths = preview.files.map((f) => f.path);
    await expect(
      commitPlanning(
        root,
        {
          id: randomUUID(),
          revision: preview.revision,
          paths,
          message: "Concurrent",
        },
        {
          checkpoint: async (point) => {
            if (point === "before-commit") {
              await writeFile(join(root, "code.txt"), "User staged\n");
              git(["add", "code.txt"]);
            }
          },
        },
      ),
    ).rejects.toThrow(/index|changed/);
    expect(git(["show", ":code.txt"])).toBe("User staged");
    preview = await previewPlanning(root);
    const id = randomUUID();
    const result = await commitPlanning(
      root,
      { id, revision: preview.revision, paths, message: "Keep conflict" },
      {
        checkpoint: async (point) => {
          if (point === "after-commit") {
            await writeFile(
              join(root, ".voidra/README.md"),
              "User staged planning\n",
            );
            git(["add", ".voidra/README.md"]);
          }
        },
      },
    );
    expect(result.reconciled).toBe(false);
    expect(git(["show", ":.voidra/README.md"])).toBe("User staged planning");
    expect(
      (
        await commitPlanning(root, {
          id,
          revision: preview.revision,
          paths,
          message: "Keep conflict",
        })
      ).commit,
    ).toBe(result.commit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("recovers a real process death after commit and audits pending ownership", async () => {
  const { root, git } = await fixture();
  try {
    const preview = await previewPlanning(root),
      id = randomUUID();
    const input = {
      id,
      revision: preview.revision,
      paths: preview.files.map((file) => file.path),
      message: "Interrupted planning",
    };
    const module = resolve("tools/run-engine/src/planning-commit.ts");
    const script = `import {commitPlanning} from ${JSON.stringify(module)}; await commitPlanning(${JSON.stringify(root)}, ${JSON.stringify(input)}, {checkpoint: point => {if (point === 'after-commit') process.exit(91);}});`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8" },
    );
    expect(child.status, child.stderr).toBe(91);
    const pending = await pendingPlanning(root);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id, recoverable: true });
    expect(pending[0]?.commit).toBe(git(["rev-parse", "HEAD"]));
    await expect(discardPlanning(root, id)).rejects.toThrow(
      /commit already exists/,
    );
    const before = git(["rev-list", "--count", "HEAD"]);
    expect((await recoverPlanning(root, id)).reconciled).toBe(true);
    expect(git(["rev-list", "--count", "HEAD"])).toBe(before);
    expect(await pendingPlanning(root)).toEqual([]);
    await writeFile(join(root, ".voidra/README.md"), "Next planning edit\n");
    const next = await previewPlanning(root),
      nextInput = {
        id: randomUUID(),
        revision: next.revision,
        paths: next.files.map((file) => file.path),
        message: "Unfinished attempt",
      };
    const second = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {commitPlanning} from ${JSON.stringify(module)}; await commitPlanning(${JSON.stringify(root)}, ${JSON.stringify(nextInput)}, {checkpoint: point => {if (point === 'after-staging') process.exit(91);}});`,
      ],
      { encoding: "utf8" },
    );
    expect(second.status, second.stderr).toBe(91);
    expect((await pendingPlanning(root))[0]).toMatchObject({
      id: nextInput.id,
      commit: null,
      recoverable: true,
    });
    await discardPlanning(root, nextInput.id);
    expect(await pendingPlanning(root)).toEqual([]);
    await expect(discardPlanning(root, "bad-id")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
