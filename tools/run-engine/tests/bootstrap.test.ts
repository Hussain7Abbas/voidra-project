import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  approveAction,
  checkProject,
  getPlanRevision,
  hash,
  parseRecord,
  replaceActionQueue,
  serializeRecord,
} from "voidra";
import {
  commitResult,
  failRun,
  finalizeResult,
  guardRun,
  prepareResult,
  publishPlanning,
  startRun,
} from "../src/run.ts";
import { fixture } from "./helpers.ts";

const proposal = {
  action: "act-000000",
  kind: "plan",
  requirements:
    "## Goal\nBootstrap a local project.\n## Out of scope\nRemote services.\n",
  blueprint:
    "## Approach\nInitialize local Git after approval.\n## Testing seams\nReal files and Git.\n## Proposed ADRs\nNone.\n",
  acceptance: "- First project behavior works.\n",
};
async function newProject() {
  const root = await fixture("feature"),
    path = ".voidra/actions/act-000000/action.md",
    doc = parseRecord(path, await readFile(join(root, path)));
  await writeFile(
    join(root, path),
    serializeRecord(doc, {
      ...doc.data,
      title: "Bootstrap",
      assignee: "Fixture owner <fixture@example.test>",
    }),
  );
  await rm(join(root, ".git"), { recursive: true });
  return root;
}
async function queued(root: string) {
  const q = (await checkProject(root)).files.get(
    ".voidra/local/pending-actions.md",
  );
  await replaceActionQueue(root, {
    ids: ["act-000000"],
    revision: q ? hash(q) : null,
    by: "Fixture owner",
  });
}
it.each(["go", "plan"] as const)(
  "plans a non-Git Bootstrap in %s mode without Git or source effects",
  async (mode) => {
    const root = await newProject();
    try {
      const run = await startRun(root, "codex", process.pid, mode);
      if (!run) throw Error("Missing run");
      expect(run.phase).toBe("started");
      expect(run.baseCommit).toBeNull();
      const inspection = await checkProject(root);
      expect(
        inspection.records.get(run.runPath)?.document.data.consumedRecords,
      ).toContain("act-000000");
      await expect(
        guardRun(root, run.ownerToken, ["README.md"]),
      ).rejects.toThrow(/stage|planning-only/i);
      await publishPlanning(root, run.ownerToken, proposal);
      expect((await checkProject(root)).diagnostics).toEqual([]);
      expect(await readFile(join(root, "README.md"), "utf8")).toBe(
        "# Fixture\n",
      );
      await expect(readFile(join(root, ".git", "HEAD"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("initializes only approved Bootstrap after consumption and creates one normal first result commit", async () => {
  const root = await newProject();
  const cloneRoot = await mkdtemp(join(tmpdir(), "voidra-bootstrap-clone-"));
  try {
    await rm(join(root, "README.md"));
    await writeFile(join(root, "existing.txt"), "Preserve this user file.\n");
    const plan = await startRun(root, "codex", process.pid);
    if (!plan) throw Error("Missing run");
    await publishPlanning(root, plan.ownerToken, proposal);
    await approveAction(
      root,
      "act-000000",
      "Fixture owner",
      (await getPlanRevision(root, "act-000000")).revision,
    );
    await queued(root);
    const run = await startRun(root, "codex", process.pid);
    if (!run) throw Error("Missing run");
    expect(
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe(await realpath(root));
    expect(
      (await checkProject(root)).records.get(run.runPath)?.document.data
        .consumedRecords,
    ).toContain("act-000000");
    const baselinePath = ".voidra/README.md";
    const baseline = await readFile(join(root, baselinePath));
    await writeFile(join(root, baselinePath), `${baseline}\nOutside edit.\n`);
    await expect(guardRun(root, run.ownerToken)).rejects.toThrow(
      /baseline changed/i,
    );
    await writeFile(join(root, baselinePath), baseline);
    execFileSync("git", ["config", "user.name", "Fixture owner"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], {
      cwd: root,
    });
    await guardRun(root, run.ownerToken, ["README.md"]);
    await writeFile(join(root, "README.md"), "# First behavior\n");
    await prepareResult(root, run.ownerToken, {
      summary: "Bootstrap works.",
      paths: ["README.md"],
      checks: [{ name: "Behavior verified", passed: true }],
      reviews: {
        standards: { passed: true, summary: "Conventions verified." },
        plan: { passed: true, summary: "Approved scope verified." },
      },
    });
    const commit = await commitResult(
      root,
      run.ownerToken,
      "Bootstrap local project",
    );
    expect(
      await commitResult(root, run.ownerToken, "Bootstrap local project"),
    ).toBe(commit);
    await finalizeResult(root, run.ownerToken);
    const message = execFileSync("git", ["show", "-s", "--format=%B"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(message).toContain("Voidra-Action: act-000000");
    expect(message).toContain(`Voidra-Run: ${run.run}`);
    expect(
      execFileSync("git", ["rev-list", "--count", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("1");
    expect((await checkProject(root)).diagnostics).toEqual([]);
    execFileSync("git", ["clone", "--quiet", root, join(cloneRoot, "project")]);
    const cloned = await checkProject(join(cloneRoot, "project"));
    expect(cloned.metadata).not.toBeNull();
    expect(cloned.diagnostics).toEqual([]);
    expect(
      execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).not.toContain(".voidra/local/");
    expect(
      execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).not.toContain("existing.txt");
    expect(await readFile(join(root, "existing.txt"), "utf8")).toBe(
      "Preserve this user file.\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(cloneRoot, { recursive: true, force: true });
  }
});
it("detects Git creation during non-Git planning without publishing a plan", async () => {
  const root = await newProject();
  try {
    const run = await startRun(root, "codex", process.pid, "plan");
    if (!run) throw Error("Missing run");
    execFileSync("git", ["init", "-q"], { cwd: root });
    await expect(
      publishPlanning(root, run.ownerToken, proposal),
    ).rejects.toThrow(/Git.*changed/i);
    await failRun(root, run.ownerToken, "Outside Git creation preserved.");
    await expect(
      readFile(join(root, ".voidra/actions/act-000000/requirements.md")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it.each(["plan-only", "stale"])(
  "stops %s approved Bootstrap without initializing Git",
  async (kind) => {
    const root = await newProject();
    try {
      const first = await startRun(root, "codex", process.pid);
      if (!first) throw Error("Missing run");
      await publishPlanning(root, first.ownerToken, proposal);
      await approveAction(
        root,
        "act-000000",
        "Fixture owner",
        (await getPlanRevision(root, "act-000000")).revision,
      );
      await queued(root);
      if (kind === "stale")
        await writeFile(
          join(root, ".voidra/actions/act-000000/blueprint.md"),
          `${await readFile(
            join(root, ".voidra/actions/act-000000/blueprint.md"),
            "utf8",
          )}\nChanged scope.\n`,
        );
      const run = await startRun(
        root,
        "codex",
        process.pid,
        kind === "plan-only" ? "plan" : "go",
      );
      expect(run?.phase).toBe("finalized");
      await expect(readFile(join(root, ".git/HEAD"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("refuses a selected repository subfolder and ordinary non-Git implementation before run writes", async () => {
  const root = await fixture();
  try {
    const child = join(root, "selected");
    await mkdir(child);
    const { cp } = await import("node:fs/promises");
    await cp(join(root, ".voidra"), join(child, ".voidra"), {
      recursive: true,
    });
    for (const selected of [child, root]) {
      if (selected === root) await rm(join(root, ".git"), { recursive: true });
      const before = (await checkProject(selected)).files;
      await expect(startRun(selected, "codex", process.pid)).rejects.toThrow(
        /root|Git repository/i,
      );
      const after = await checkProject(selected);
      expect([...after.files].map(([p, b]) => [p, hash(b)])).toEqual(
        [...before].map(([p, b]) => [p, hash(b)]),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("preserves pre-existing Bootstrap source and refuses invalid Git metadata", async () => {
  const root = await newProject();
  try {
    const first = await startRun(root, "codex", process.pid);
    if (!first) throw Error("Missing run");
    await publishPlanning(root, first.ownerToken, proposal);
    await approveAction(
      root,
      "act-000000",
      "Fixture owner",
      (await getPlanRevision(root, "act-000000")).revision,
    );
    await queued(root);
    const run = await startRun(root, "codex", process.pid);
    if (!run) throw Error("Missing run");
    await expect(guardRun(root, run.ownerToken, ["README.md"])).rejects.toThrow(
      /pre-existing/i,
    );
    await failRun(root, run.ownerToken, "Preserved outside source.");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Fixture\n");
    await rm(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git"), "invalid Git metadata\n");
    await queued(root);
    const before = (await checkProject(root)).files;
    await expect(startRun(root, "codex", process.pid)).rejects.toThrow(
      /invalid/i,
    );
    expect(
      [...(await checkProject(root)).files].map(([p, b]) => [p, hash(b)]),
    ).toEqual([...before].map(([p, b]) => [p, hash(b)]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("accepts a linked worktree root without changing its parent history", async () => {
  const root = await fixture();
  try {
    const linked = join(root, "linked"),
      before = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      });
    execFileSync(
      "git",
      ["worktree", "add", "-q", "-b", "linked-verification", linked],
      { cwd: root },
    );
    await queued(linked);
    const run = await startRun(linked, "codex", process.pid);
    expect(run?.phase).toBe("started");
    if (!run) throw Error("Missing run");
    await failRun(linked, run.ownerToken, "Root acceptance only.");
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe(before);
    expect((await checkProject(linked)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("retains the Git-presence boundary for legacy unborn planning checkpoints", async () => {
  const root = await fixture("feature");
  try {
    const run = await startRun(root, "codex", process.pid, "plan");
    if (!run) throw Error("Missing run");
    // Legacy runtime required Git at start; compatibility must retain that prerequisite.
    const path = join(root, `.voidra/local/run-checkpoints/${run.run}.json`),
      legacy = JSON.parse(await readFile(path, "utf8"));
    delete legacy.gitRoot;
    legacy.baseCommit = null;
    legacy.baseTags = "";
    await writeFile(path, JSON.stringify(legacy));
    await rm(join(root, ".git"), { recursive: true });
    await expect(
      publishPlanning(root, run.ownerToken, proposal),
    ).rejects.toThrow(/Git.*changed/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
