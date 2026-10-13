import { rm } from "node:fs/promises";
import { expect, it } from "vitest";
import { checkProject } from "voidra";
import { startRun } from "../src/run.ts";
import { fixture } from "./helpers.ts";

it("with the app closed, a changed approved plan stops before code and releases ownership", async () => {
  const { publishPlanning } = await import("../src/run.ts"),
    { approveAction, getPlanRevision, hash, applyOperation, serializeRecord } =
      await import("voidra"),
    { readFile, writeFile } = await import("node:fs/promises"),
    { join } = await import("node:path"),
    { execFileSync } = await import("node:child_process");
  const root = await fixture("feature");
  try {
    const first = await startRun(root, "codex", process.pid);
    if (!first) throw new Error("Missing run");
    await publishPlanning(root, first.ownerToken, {
      action: first.action,
      kind: "plan",
      requirements:
        "## Goal\nConfirmed export scope.\n## Out of scope\nNetwork access.\n",
      blueprint:
        "## Approach\nLocal export.\n## Testing seams\nPublic CLI seam.\n## Proposed ADRs\nNone.\n",
      acceptance: "- Export round-trips.\n",
    });
    await approveAction(
      root,
      first.action,
      "Fixture owner",
      (await getPlanRevision(root, first.action)).revision,
    );
    const queue = (await checkProject(root)).records.get(
      ".voidra/local/pending-actions.md",
    )?.document;
    if (!queue) throw new Error("Missing queue");
    await applyOperation(root, {
      changes: [
        {
          path: queue.file,
          expectedHash: hash(queue.raw),
          content: serializeRecord(
            queue,
            queue.data,
            `1. [ ] ${first.action}\n`,
          ).toString(),
        },
      ],
    });
    const path = join(root, `.voidra/actions/${first.action}/blueprint.md`);
    await writeFile(
      path,
      `${await readFile(path, "utf8")}\nOutside plan change.\n`,
    );
    const before = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    const stopped = await startRun(root, "codex", process.pid);
    expect(stopped?.phase).toBe("finalized");
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(project.records.get(first.actionPath)?.document.data).toMatchObject({
      stage: "plan",
      status: "waiting",
    });
    expect(project.files.has(".voidra/local/run.lock")).toBe(false);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# Fixture\n");
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("resumes its owned partial work after a human blocker without treating it as user edits", async () => {
  const {
      publishHumanBlocker,
      guardRun,
      prepareResult,
      commitResult,
      finalizeResult,
    } = await import("../src/run.ts"),
    { setHumanStep, hash, applyOperation, serializeRecord } = await import(
      "voidra"
    ),
    { writeFile } = await import("node:fs/promises"),
    { join } = await import("node:path");
  const root = await fixture();
  try {
    const first = await startRun(root, "codex", process.pid);
    if (!first) throw new Error("Missing run");
    await guardRun(root, first.ownerToken, ["README.md"]);
    await writeFile(
      join(root, "README.md"),
      "# Fixture\nPrepared installation guidance.\n",
    );
    const id = await publishHumanBlocker(root, first.ownerToken, {
      title: "Confirm wording",
      description: "Confirm the installation wording",
      steps: ["Confirm the wording"],
    });
    const project = await checkProject(root),
      human = project.records.get(`.voidra/actions/${id}/action.md`)?.document;
    if (!human) throw new Error("Missing human action");
    await setHumanStep(root, {
      id,
      revision: hash(human.raw),
      step: "step-1",
      done: true,
    });
    const queue = (await checkProject(root)).records.get(
      ".voidra/local/pending-actions.md",
    )?.document;
    if (!queue) throw new Error("Missing queue");
    await applyOperation(root, {
      changes: [
        {
          path: queue.file,
          expectedHash: hash(queue.raw),
          content: serializeRecord(
            queue,
            queue.data,
            `1. [ ] ${first.action}\n`,
          ).toString(),
        },
      ],
    });
    const second = await startRun(root, "codex", process.pid);
    if (!second) throw new Error("Missing resumed run");
    await guardRun(root, second.ownerToken, ["README.md"]);
    await prepareResult(root, second.ownerToken, {
      summary: "Completed the confirmed wording",
      paths: ["README.md"],
      checks: [{ name: "README seam", passed: true }],
    });
    await commitResult(root, second.ownerToken, "Document installation");
    await finalizeResult(root, second.ownerToken);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("resolves delegated choices through the command boundary without replacing human answers", async () => {
  const { runRuntime } = await import("../src/runtime.ts"),
    { writeFile } = await import("node:fs/promises"),
    { join } = await import("node:path"),
    { answerQuestion, hash } = await import("voidra");
  const root = await fixture("feature");
  try {
    const started = await runRuntime(
      [
        "start",
        "--agent",
        "codex",
        "--owner-pid",
        String(process.pid),
        "--mode",
        "plan",
      ],
      root,
    );
    const ctx = started.value as { action: string; ownerToken: string };
    expect(started.code).toBe(0);
    const file = join(root, ".voidra/local/proposal.json");
    await writeFile(
      file,
      JSON.stringify({
        action: ctx.action,
        kind: "questions",
        questions: [
          {
            text: "Which output?",
            why: "Defines compatibility",
            options: [
              { label: "a", description: "JSON", recommended: true },
              { label: "b", description: "Text", recommended: false },
            ],
          },
        ],
      }),
    );
    expect(
      (
        await runRuntime(
          ["planning", "--token", ctx.ownerToken, "--report", file],
          root,
        )
      ).code,
    ).toBe(0);
    const path = `.voidra/actions/${ctx.action}/questions.md`,
      project = await checkProject(root),
      doc = project.records.get(path)?.document;
    if (!doc) throw new Error("Missing questions");
    const { schemas, applyOperation, serializeRecord } = await import("voidra");
    const question = schemas.questions.parse(doc.data).rounds[0]?.questions[0];
    if (!question) throw new Error("Missing question");
    await answerQuestion(root, {
      action: ctx.action,
      question: question.id,
      revision: hash(doc.raw),
      by: "Fixture owner",
      answer: { kind: "agent-decides" },
    });
    const queue = (await checkProject(root)).records.get(
      ".voidra/local/pending-actions.md",
    )?.document;
    if (!queue) throw new Error("Missing queue");
    await applyOperation(root, {
      changes: [
        {
          path: queue.file,
          expectedHash: hash(queue.raw),
          content: serializeRecord(
            queue,
            queue.data,
            `1. [ ] ${ctx.action}\n`,
          ).toString(),
        },
      ],
    });
    const second = (
      await runRuntime(
        ["start", "--agent", "codex", "--owner-pid", String(process.pid)],
        root,
      )
    ).value as { ownerToken: string };
    await writeFile(
      file,
      JSON.stringify([
        {
          question: question.id,
          choice: "a",
          reason: "Matches the confirmed offline interoperability goal",
        },
      ]),
    );
    expect(
      (
        await runRuntime(
          ["choices", "--token", second.ownerToken, "--report", file],
          root,
        )
      ).code,
    ).toBe(0);
    expect(
      (
        await runRuntime(
          ["choices", "--token", second.ownerToken, "--report", file],
          root,
        )
      ).code,
    ).toBe(1);
    expect(
      schemas.questions.parse(
        (await checkProject(root)).records.get(path)?.document.data,
      ).rounds[0]?.questions[0],
    ).toMatchObject({
      answer: { kind: "agent-decides", by: "Fixture owner" },
      agentChoice: {
        choice: "a",
        by: "codex",
        reason: expect.any(String),
        at: expect.any(String),
      },
    });
    await writeFile(
      file,
      JSON.stringify({
        title: "Confirm access",
        description: "A person must confirm local access",
        steps: ["Confirm access"],
      }),
    );
    expect(
      (
        await runRuntime(
          ["human", "--token", second.ownerToken, "--report", file],
          root,
        )
      ).code,
    ).toBe(0);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses source and tag changes in planning-only runs and refuses implementation preparation", async () => {
  const { publishPlanning, prepareResult, commitResult } = await import(
    "../src/run.ts"
  );
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const root = await fixture("feature");
  try {
    const ctx = await startRun(root, "codex", process.pid, "plan");
    if (!ctx) throw new Error("Missing run");
    const input = {
      action: ctx.action,
      kind: "plan",
      requirements: "Scope",
      blueprint: "Public seams",
      acceptance: "Observable checks",
    };
    await expect(
      prepareResult(root, ctx.ownerToken, {
        summary: "Unsafe",
        paths: [],
        checks: [],
      }),
    ).rejects.toThrow("Planning-only");
    await expect(commitResult(root, ctx.ownerToken, "Unsafe")).rejects.toThrow(
      "Planning-only",
    );
    await writeFile(join(root, "README.md"), "Outside planning change\n");
    await expect(publishPlanning(root, ctx.ownerToken, input)).rejects.toThrow(
      "non-planning",
    );
    await writeFile(join(root, "README.md"), "# Fixture\n");
    execFileSync("git", ["tag", "outside"], { cwd: root });
    await expect(publishPlanning(root, ctx.ownerToken, input)).rejects.toThrow(
      "tags changed",
    );
    expect((await checkProject(root)).files.has(".voidra/local/run.lock")).toBe(
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses to include pre-existing user edits in a Docs commit", async () => {
  const { guardRun, failRun } = await import("../src/run.ts"),
    { writeFile } = await import("node:fs/promises"),
    { join } = await import("node:path");
  const root = await fixture();
  try {
    await writeFile(join(root, "README.md"), "User changes\n");
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Missing run");
    await expect(guardRun(root, ctx.ownerToken, ["README.md"])).rejects.toThrow(
      "Pre-existing user edits",
    );
    await failRun(root, ctx.ownerToken, "Preserved overlapping user edits");
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("publishes Research findings and proposed ideas without source or Git effects", async () => {
  const { publishResearch } = await import("../src/run.ts");
  const { execFileSync } = await import("node:child_process");
  const root = await fixture("research");
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Missing run");
    await publishResearch(root, ctx.ownerToken, {
      findings: "Local JSON export covers the documented needs.",
      recommendation: "Keep export local and add round-trip validation.",
      ideas: [
        { title: "Validate exports", description: "Check round-trip data." },
      ],
    });
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(project.records.get(ctx.actionPath)?.document.data).toMatchObject({
      stage: "review",
      status: "waiting",
    });
    expect(
      [...project.records.values()].filter((r) => r.kind === "idea"),
    ).toHaveLength(1);
    expect(project.files.has(".voidra/local/run.lock")).toBe(false);
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe(head);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("creates a human checklist that blocks the active action and preserves the start marker", async () => {
  const { publishHumanBlocker } = await import("../src/run.ts");
  const root = await fixture("feature");
  try {
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Missing run");
    const id = await publishHumanBlocker(root, ctx.ownerToken, {
      title: "Create the service account",
      description:
        "Open the provider settings and create a development account.",
      steps: ["Create the account", "Confirm access in the project"],
    });
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(
      project.records.get(`.voidra/actions/${id}/action.md`)?.document.data,
    ).toMatchObject({
      doneBy: "you",
      status: "ready",
      steps: [{ done: false }, { done: false }],
    });
    expect(project.records.get(ctx.actionPath)?.document.data).toMatchObject({
      blockedBy: [id],
      status: "ready",
    });
    expect(project.records.get(ctx.runPath)?.document.data).toMatchObject({
      outcome: "waiting",
      consumedRecords: expect.arrayContaining([ctx.action]),
    });
    expect(project.files.has(".voidra/local/run.lock")).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const type of ["feature", "bug", "research", "profile-change"] as const)
  it(`starts ${type} in its planning stage and persists consumption before work`, async () => {
    const root = await fixture(type);
    try {
      const ctx = await startRun(root, "codex", process.pid);
      expect(ctx?.phase).toBe("started");
      expect((await checkProject(root)).diagnostics).toEqual([]);
      const result = [...(await checkProject(root)).records.values()].find(
        (r) => r.kind === "run",
      );
      expect(result?.document.data).toMatchObject({
        outcome: "running",
        fromStage: "discovery",
        consumedRecords: expect.arrayContaining(["act-000000"]),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

it("publishes owned Discovery questions and a three-file plan, preserving consumption and stopping without code or commits", async () => {
  const { publishPlanning } = await import("../src/run.ts"),
    { readFile } = await import("node:fs/promises"),
    { join } = await import("node:path"),
    { applyOperation, serializeRecord, hash, answerQuestion } = await import(
      "voidra"
    ),
    { execFileSync } = await import("node:child_process");
  const root = await fixture("feature");
  try {
    const before = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
      source = await readFile(join(root, "README.md"), "utf8");
    const first = await startRun(root, "codex", process.pid);
    if (!first) throw new Error("Missing run");
    await publishPlanning(root, first.ownerToken, {
      action: first.action,
      kind: "questions",
      questions: [
        {
          text: "Which export?",
          why: "Defines the format",
          options: [
            { label: "a", description: "JSON", recommended: true },
            { label: "b", description: "Markdown", recommended: false },
          ],
        },
      ],
      glossary: "# Glossary\n\nExport: a portable copy of local notes.\n",
    });
    let project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(project.files.has(".voidra/local/run.lock")).toBe(false);
    expect(project.records.get(first.runPath)?.document.data).toMatchObject({
      outcome: "waiting",
      toStage: "discovery",
      consumedRecords: expect.arrayContaining([first.action]),
    });
    const path = `.voidra/actions/${first.action}/questions.md`,
      doc = project.records.get(path)?.document,
      q = (
        doc?.data.rounds as { questions: { id: string }[] }[] | undefined
      )?.[0]?.questions[0];
    if (!doc || !q) throw new Error("Missing question");
    await answerQuestion(root, {
      action: first.action,
      question: q.id,
      revision: hash(doc.raw),
      by: "Fixture owner",
      answer: { kind: "choice", choice: "a" },
    });
    const queuePath = ".voidra/local/pending-actions.md",
      queue = (await checkProject(root)).records.get(queuePath)?.document;
    if (!queue) throw new Error("Missing queue");
    await applyOperation(root, {
      changes: [
        {
          path: queuePath,
          expectedHash: hash(queue.raw),
          content: serializeRecord(
            queue,
            queue.data,
            `1. [ ] ${first.action}\n`,
          ).toString(),
        },
      ],
    });
    const second = await startRun(root, "codex", process.pid);
    if (!second) throw new Error("Missing run");
    await publishPlanning(root, second.ownerToken, {
      action: second.action,
      kind: "plan",
      requirements:
        "## Goal\nExport notes.\n## Out of scope\nShared accounts.\n",
      blueprint:
        "## Approach\nAdd a CLI export boundary.\n## Testing seams\nPublic CLI input/output.\n## Proposed ADRs\nNone.\n",
      acceptance: "- Exported notes round-trip.\n",
    });
    project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(project.records.get(second.actionPath)?.document.data).toMatchObject(
      { stage: "plan", status: "waiting" },
    );
    expect(
      project.records.get(second.actionPath)?.document.data.planApproval,
    ).toBeUndefined();
    expect(await readFile(join(root, "README.md"), "utf8")).toBe(source);
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("runs approved Feature verification and commits exactly its paths with two review parts", async () => {
  const {
      approveAction,
      getPlanRevision,
      hash,
      serializeRecord,
      checkProject,
    } = await import("voidra"),
    { publishPlanning, prepareResult, commitResult, finalizeResult } =
      await import("../src/run.ts"),
    { readFile, writeFile } = await import("node:fs/promises"),
    { join } = await import("node:path"),
    { execFileSync } = await import("node:child_process");
  const root = await fixture("feature");
  try {
    const first = await startRun(root, "codex", process.pid);
    if (!first) throw new Error("Missing run");
    await publishPlanning(root, first.ownerToken, {
      action: first.action,
      kind: "plan",
      requirements:
        "## Goal\nDocument setup.\n## Out of scope\nOther changes.\n",
      blueprint:
        "## Approach\nUpdate README.\n## Testing seams\nREADME content.\n## Proposed ADRs\nNone.\n",
      acceptance: "- README names setup.\n",
    });
    await approveAction(
      root,
      first.action,
      "Fixture owner",
      (await getPlanRevision(root, first.action)).revision,
    );
    const project = await checkProject(root),
      queue = project.records.get(".voidra/local/pending-actions.md")?.document;
    if (!queue) throw new Error("Missing queue");
    const { applyOperation } = await import("voidra");
    await applyOperation(root, {
      changes: [
        {
          path: queue.file,
          expectedHash: hash(queue.raw),
          content: serializeRecord(
            queue,
            queue.data,
            `1. [ ] ${first.action}\n`,
          ).toString(),
        },
      ],
    });
    await writeFile(join(root, "unrelated.txt"), "User staging\n");
    execFileSync("git", ["add", "unrelated.txt"], { cwd: root });
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Missing implementation run");
    await writeFile(
      join(root, "README.md"),
      "# Fixture\nInstall with Node 24.\n",
    );
    await prepareResult(root, ctx.ownerToken, {
      summary: "Added setup",
      paths: ["README.md"],
      checks: [{ name: "README boundary", passed: true }],
      reviews: {
        standards: { passed: true, summary: "Preserves project conventions" },
        plan: { passed: true, summary: "Covers the approved setup seam" },
      },
    });
    await commitResult(root, ctx.ownerToken, "Document setup");
    await finalizeResult(root, ctx.ownerToken);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(
      (await checkProject(root)).records.get(ctx.actionPath)?.document.data
        .stage,
    ).toBe("review");
    expect(
      execFileSync("git", ["diff", "--cached", "--name-only"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("unrelated.txt");
    expect(
      execFileSync("git", ["log", "-1", "--format=%B"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toContain(`Voidra-Action: ${ctx.action}`);
    expect(await readFile(join(root, "unrelated.txt"), "utf8")).toBe(
      "User staging\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
