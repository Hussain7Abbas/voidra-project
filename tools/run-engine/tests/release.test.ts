import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  applyOperation,
  checkProject,
  createReleaseAction,
  decideReview,
  hash,
  parseRecord,
  releaseCandidates,
  replaceActionQueue,
  reviewRevision,
  serializeRecord,
} from "voidra";
import {
  commitResult,
  finalizeResult,
  guardRun,
  prepareResult,
  publishReleasePlan,
  recoverRun,
  runContext,
  startRun,
} from "../src/run.ts";
import { runRuntime } from "../src/runtime.ts";
import { fixture } from "./helpers.ts";

const proposal = {
  version: "0.2.0",
  tag: "v0.2.0",
  message: "chore(release): 0.2.0",
  paths: ["package.json", "CHANGELOG.md"],
  notes: "## Notes\nCompleted documentation and acknowledged setup.\n",
  requirements:
    "## Goal\nRelease completed work as 0.2.0.\n## Out of scope\nPublishing.\n",
  blueprint:
    "## Approach\nBump package.json, prepend CHANGELOG.md using its existing convention, and tag locally after acceptance.\n## Testing seams\nRead the version and existing changelog; inspect actual Git commit/tag and recovered records.\n## Proposed ADRs\nNone.\n",
  acceptance:
    "- Version 0.2.0 and the original changelog section remain.\n- Create one commit/tag and mark selected work Released.\n",
};
const report = {
  summary: "Verified the release version and changelog.",
  paths: proposal.paths,
  checks: [{ name: "Version and changelog readback", passed: true }],
  reviews: {
    standards: { passed: true, summary: "Preserves fixture conventions." },
    plan: { passed: true, summary: "Matches the accepted local release." },
  },
};
const git = (root: string, args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
async function queued(root: string, id: string) {
  const project = await checkProject(root),
    raw = project.files.get(".voidra/local/pending-actions.md"),
    action = project.files.get(`.voidra/actions/${id}/action.md`);
  if (!action) throw new Error("Release action missing");
  await replaceActionQueue(root, {
    ids: [id],
    revision: raw ? hash(raw) : null,
    revisions: { [id]: hash(action) },
    by: "Verification driver",
  });
}
async function releaseFixture() {
  const root = await fixture(),
    path = ".voidra/actions/act-000000/action.md",
    old = parseRecord(path, await readFile(join(root, path)));
  await writeFile(
    join(root, path),
    serializeRecord(old, { ...old.data, stage: "done", status: "complete" }),
  );
  const human = ".voidra/actions/act-000001/action.md";
  await mkdir(join(root, ".voidra/actions/act-000001"), { recursive: true });
  await writeFile(
    join(root, human),
    serializeRecord(
      parseRecord(human, "---\n{}\n---\n"),
      {
        id: "act-000001",
        type: "docs",
        title: "Acknowledged setup",
        status: "complete",
        doneBy: "you",
        steps: [
          {
            id: "acknowledged",
            title: "Acknowledge fixture scope",
            done: true,
          },
        ],
      },
      "Completed fixture checklist.\n",
    ),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "release-fixture", version: "0.1.0" }) + "\n",
  );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n## 0.1.0\n- Original.\n",
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "Prepared completed work"]);
  const candidates = releaseCandidates(await checkProject(root)),
    id = await createReleaseAction(root, {
      actions: candidates.map(({ id, revision }) => ({ id, revision })),
      by: "Verification driver",
    });
  await queued(root, id);
  return { root, id };
}
async function accepted(root: string, id: string) {
  const ctx = await startRun(root, "codex", process.pid);
  if (!ctx) throw new Error("Plan run missing");
  expect(ctx.phase).toBe("started");
  await publishReleasePlan(root, ctx.ownerToken, proposal);
  const project = await checkProject(root);
  await decideReview(
    root,
    id,
    reviewRevision(project, id),
    "accepted",
    "",
    "Verification driver",
  );
  await queued(root, id);
}
async function bump(root: string, token: string) {
  await guardRun(root, token, proposal.paths);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "release-fixture", version: proposal.version }) +
      "\n",
  );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n## 0.2.0\n- Completed documentation.\n\n## 0.1.0\n- Original.\n",
  );
  expect(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
  ).toBe(proposal.version);
  await prepareResult(root, token, report);
}
it("plans, rejects, accepts and finalizes one local release, preserving its changelog and human stage semantics", async () => {
  const { root, id } = await releaseFixture();
  try {
    const head = git(root, ["rev-parse", "HEAD"]),
      plan = await startRun(root, "codex", process.pid);
    if (!plan) throw new Error("Plan missing");
    expect(plan.phase).toBe("started");
    await publishReleasePlan(root, plan.ownerToken, proposal);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(root, ["tag", "--list"])).toBe("");
    expect(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
    ).toBe("0.1.0");
    await decideReview(
      root,
      id,
      reviewRevision(await checkProject(root), id),
      "rejected",
      "Clarify notes.",
      "Verification driver",
    );
    expect(
      (await checkProject(root)).records.get(`.voidra/actions/${id}/action.md`)
        ?.document.data.stage,
    ).toBe("plan");
    await queued(root, id);
    await accepted(root, id);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Finalization missing");
    await bump(root, ctx.ownerToken);
    const commit = await commitResult(root, ctx.ownerToken, proposal.message);
    await finalizeResult(root, ctx.ownerToken);
    const after = await checkProject(root);
    expect(after.diagnostics).toEqual([]);
    expect(
      after.records.get(`.voidra/actions/${id}/action.md`)?.document.data,
    ).toMatchObject({
      stage: "released",
      status: "complete",
      commits: [commit],
      releaseTag: proposal.tag,
    });
    expect(
      after.records.get(".voidra/actions/act-000000/action.md")?.document.data
        .stage,
    ).toBe("released");
    expect(
      after.records.get(".voidra/actions/act-000001/action.md")?.document.data,
    ).toMatchObject({ doneBy: "you", releasedIn: proposal.version });
    expect(
      after.records.get(".voidra/actions/act-000001/action.md")?.document.data
        .stage,
    ).toBeUndefined();
    expect(git(root, ["rev-parse", `${proposal.tag}^{commit}`])).toBe(commit);
    expect(await readFile(join(root, "CHANGELOG.md"), "utf8")).toContain(
      "## 0.1.0\n- Original.",
    );
    expect((await runContext(root, ctx.run)).indexReconciled).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
for (const point of [
  "before-commit",
  "after-commit",
  "before-tag",
  "after-tag",
  "before-finalize",
  "after-finalize",
])
  it(`recovers Release ${point} with one commit and tag`, async () => {
    const { root, id } = await releaseFixture(),
      owner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
        stdio: "ignore",
      });
    try {
      await accepted(root, id);
      if (!owner.pid) throw new Error("Owner missing");
      const ctx = await startRun(root, "codex", owner.pid);
      if (!ctx) throw new Error("Run missing");
      const count = Number(git(root, ["rev-list", "--count", "HEAD"]));
      await bump(root, ctx.ownerToken);
      const options = {
        checkpoint(where: string) {
          if (where === point) throw new Error("Interrupted");
        },
      };
      if (point.includes("commit"))
        await expect(
          commitResult(root, ctx.ownerToken, proposal.message, options),
        ).rejects.toThrow("Interrupted");
      else {
        await commitResult(root, ctx.ownerToken, proposal.message);
        await expect(
          finalizeResult(root, ctx.ownerToken, options),
        ).rejects.toThrow("Interrupted");
      }
      const exited = once(owner, "exit");
      owner.kill("SIGKILL");
      await exited;
      const recovered = await recoverRun(root, ctx.run);
      expect(recovered.phase).toBe("finalized");
      expect(recovered.indexReconciled).toBe(true);
      expect(await recoverRun(root, ctx.run)).toEqual(recovered);
      expect(Number(git(root, ["rev-list", "--count", "HEAD"]))).toBe(
        count + 1,
      );
      expect(git(root, ["tag", "--list"])).toBe(proposal.tag);
      expect(git(root, ["rev-parse", `${proposal.tag}^{commit}`])).toBe(
        recovered.commit,
      );
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      owner.kill();
      await rm(root, { recursive: true, force: true });
    }
  });
it("recovers an actual process death during grouped Released updates without another commit/tag", async () => {
  const { root, id } = await releaseFixture();
  try {
    await accepted(root, id);
    const count = Number(git(root, ["rev-list", "--count", "HEAD"]));
    const script = `
      import {writeFile} from 'node:fs/promises'; import {join} from 'node:path';
      import {startRun,guardRun,prepareResult,commitResult,finalizeResult} from ${JSON.stringify(resolve("tools/run-engine/src/run.ts"))};
      const root=${JSON.stringify(root)},report=${JSON.stringify(report)},proposal=${JSON.stringify(proposal)};
      const ctx=await startRun(root,'codex',process.pid);if(!ctx)throw new Error('Run missing');process.stdout.write(ctx.run+'\\n');
      await guardRun(root,ctx.ownerToken,proposal.paths);
      await writeFile(join(root,'package.json'),JSON.stringify({name:'release-fixture',version:proposal.version})+'\\n');
      await writeFile(join(root,'CHANGELOG.md'),'# Changelog\\n\\n## 0.2.0\\n- Completed documentation.\\n\\n## 0.1.0\\n- Original.\\n');
      await prepareResult(root,ctx.ownerToken,report);await commitResult(root,ctx.ownerToken,proposal.message);
      await finalizeResult(root,ctx.ownerToken,{writeCheckpoint(point,path){if(point==='after-rename'&&path==='.voidra/actions/act-000000/action.md')process.kill(process.pid,'SIGKILL');}});
    `;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errors += String(chunk);
    });
    const [, signal] = await once(child, "exit");
    expect(signal, errors).toBe("SIGKILL");
    const run = output.trim();
    expect(run).toMatch(/^run-/);
    expect(
      [...(await checkProject(root)).records.values()].some(
        (record) =>
          record.kind === "operation" &&
          record.document.data.state === "prepared",
      ),
    ).toBe(true);
    const recovered = await recoverRun(root, run);
    expect(recovered.phase).toBe("finalized");
    expect(recovered.indexReconciled).toBe(true);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(Number(git(root, ["rev-list", "--count", "HEAD"]))).toBe(count + 1);
    expect(git(root, ["tag", "--list"])).toBe(proposal.tag);
    expect(await recoverRun(root, run)).toEqual(recovered);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("reconciles a matching tag, refuses an unrelated tag and preserves changed prepared files", async () => {
  for (const conflict of [false, true]) {
    const { root, id } = await releaseFixture();
    try {
      await accepted(root, id);
      const ctx = await startRun(root, "codex", process.pid);
      if (!ctx) throw new Error("Run missing");
      await bump(root, ctx.ownerToken);
      const commit = await commitResult(root, ctx.ownerToken, proposal.message);
      git(root, [
        "tag",
        proposal.tag,
        conflict ? (ctx.baseCommit as string) : commit,
      ]);
      if (conflict) {
        await expect(finalizeResult(root, ctx.ownerToken)).rejects.toThrow(
          /conflicting/i,
        );
        expect(git(root, ["rev-parse", `${proposal.tag}^{commit}`])).toBe(
          ctx.baseCommit,
        );
      } else {
        await finalizeResult(root, ctx.ownerToken);
        expect((await checkProject(root)).diagnostics).toEqual([]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  const { root, id } = await releaseFixture();
  try {
    await accepted(root, id);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Run missing");
    await bump(root, ctx.ownerToken);
    await commitResult(root, ctx.ownerToken, proposal.message);
    await writeFile(join(root, "package.json"), '{"version":"9.0.0"}\n');
    await expect(finalizeResult(root, ctx.ownerToken)).rejects.toThrow(
      /changed/,
    );
    expect(git(root, ["tag", "--list"])).toBe("");
    expect(await readFile(join(root, "package.json"), "utf8")).toContain(
      "9.0.0",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects unsafe or incomplete release proposals before any source or planning replacement", async () => {
  const { root } = await releaseFixture();
  try {
    git(root, ["tag", "existing-tag"]);
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Run missing");
    const original = await readFile(join(root, ctx.actionPath));
    const cases: [Parameters<typeof publishReleasePlan>[2], RegExp][] = [
      [{ ...proposal, tag: "-invalid" }, /invalid/i],
      [{ ...proposal, tag: "existing-tag" }, /already exists/i],
      [{ ...proposal, paths: ["package.json", "package.json"] }, /duplicate/i],
      [{ ...proposal, paths: [ctx.actionPath] }, /repository files/i],
      [
        {
          ...proposal,
          actions: [{ id: "act-999999", revision: "a".repeat(64) }],
        },
        /ineligible/i,
      ],
      [
        {
          ...proposal,
          actions: [
            { id: "act-000000", revision: "a".repeat(64) },
            { id: "act-000000", revision: "a".repeat(64) },
          ],
        },
        /once/i,
      ],
    ];
    for (const [input, error] of cases)
      await expect(
        publishReleasePlan(root, ctx.ownerToken, input),
      ).rejects.toThrow(error);
    expect(await readFile(join(root, ctx.actionPath))).toEqual(original);
    const profilePath = ".voidra/profile/problem.md";
    await writeFile(
      join(root, profilePath),
      `${await readFile(join(root, profilePath), "utf8")}\nOutside note\n`,
    );
    await expect(
      publishReleasePlan(root, ctx.ownerToken, proposal),
    ).rejects.toThrow(/consumed record changed/i);
    expect(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
    ).toBe("0.1.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  for (const type of ["docs", "release"] as const) {
    const root = await fixture(type);
    try {
      const ctx = await startRun(root, "codex", process.pid);
      if (!ctx) throw new Error("Run missing");
      await expect(
        publishReleasePlan(root, ctx.ownerToken, proposal),
      ).rejects.toThrow(type === "docs" ? /owned Plan/ : /Choose completed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
it("replanning can replace only this action's draft version and preserves an unrelated version", async () => {
  const { root, id } = await releaseFixture();
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Run missing");
    await publishReleasePlan(root, ctx.ownerToken, proposal);
    await decideReview(
      root,
      id,
      reviewRevision(await checkProject(root), id),
      "rejected",
      "Use version 0.3.0.",
      "Verification driver",
    );
    await queued(root, id);
    const next = await startRun(root, "codex", process.pid);
    if (!next) throw new Error("Plan missing");
    await publishReleasePlan(root, next.ownerToken, {
      ...proposal,
      version: "0.3.0",
      tag: "v0.3.0",
      message: "chore(release): 0.3.0",
    });
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(
      project.records.get(".voidra/releases/0.2.0.md")?.document.data
        .supersededByVersion,
    ).toBe("0.3.0");
    expect(project.files.has(".voidra/releases/0.3.0.md")).toBe(true);
    await decideReview(
      root,
      id,
      reviewRevision(project, id),
      "rejected",
      "Investigate version collision.",
      "Verification driver",
    );
    const other = ".voidra/actions/act-000002/action.md",
      record = ".voidra/releases/0.4.0.md";
    await applyOperation(root, {
      changes: [
        {
          path: other,
          expectedHash: null,
          content: serializeRecord(
            parseRecord(other, "---\n{}\n---\n"),
            {
              id: "act-000002",
              title: "Other release",
              type: "release",
              stage: "plan",
              status: "ready",
              doneBy: "agent",
            },
            "Other release.\n",
          ).toString(),
        },
        {
          path: record,
          expectedHash: null,
          content: serializeRecord(
            parseRecord(record, "---\n{}\n---\n"),
            {
              version: "0.4.0",
              action: "act-000002",
              actions: [],
              status: "draft",
            },
            "Other notes.\n",
          ).toString(),
        },
      ],
    });
    await queued(root, id);
    const third = await startRun(root, "codex", process.pid);
    if (!third) throw new Error("Plan missing");
    await expect(
      publishReleasePlan(root, third.ownerToken, {
        ...proposal,
        version: "0.4.0",
        tag: "v0.4.0",
      }),
    ).rejects.toThrow(/another release/);
    expect((await checkProject(root)).records.get(record)?.document.body).toBe(
      "Other notes.\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("the public Release CLI publishes a proposal and its approved notes-only scope cannot edit code", async () => {
  const { root, id } = await releaseFixture();
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Run missing");
    const path = ".voidra/local/release-report.json";
    await writeFile(
      join(root, path),
      JSON.stringify({ ...proposal, paths: [] }),
    );
    expect(
      await runRuntime(
        ["release-plan", "--token", ctx.ownerToken, "--report", path],
        root,
      ),
    ).toEqual({ code: 0, value: { gate: "review" } });
    await decideReview(
      root,
      id,
      reviewRevision(await checkProject(root), id),
      "accepted",
      "",
      "Verification driver",
    );
    await queued(root, id);
    const run = await startRun(root, "codex", process.pid);
    if (!run) throw new Error("Run missing");
    const guard = ".voidra/local/guard.json";
    await writeFile(join(root, guard), JSON.stringify(["package.json"]));
    expect(
      (
        await runRuntime(
          ["guard", "--token", run.ownerToken, "--report", guard],
          root,
        )
      ).code,
    ).toBe(1);
    await writeFile(join(root, guard), JSON.stringify({ unexpected: true }));
    expect(
      (
        await runRuntime(
          ["guard", "--token", run.ownerToken, "--report", guard],
          root,
        )
      ).code,
    ).toBe(1);
    await writeFile(join(root, guard), "[]");
    expect(
      (
        await runRuntime(
          ["guard", "--token", run.ownerToken, "--report", guard],
          root,
        )
      ).code,
    ).toBe(0);
    await prepareResult(root, run.ownerToken, { ...report, paths: [] });
    await expect(
      commitResult(root, run.ownerToken, "Different message"),
    ).rejects.toThrow(/accepted release/);
    await commitResult(root, run.ownerToken, proposal.message);
    await finalizeResult(root, run.ownerToken);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
    ).toBe("0.1.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
