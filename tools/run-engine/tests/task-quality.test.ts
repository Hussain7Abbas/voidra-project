import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  answerQuestion,
  approveAction,
  checkProject,
  createAction,
  editAction,
  enableTaskTracking,
  getPlanRevision,
  hash,
  moveTask,
  previewTaskTracking,
  projectTasks,
  readActionSequence,
} from "voidra";
import {
  commitResult,
  finalizeResult,
  guardRun,
  prepareResult,
  publishPlanning,
  publishQuality,
  publishResearch,
  startRun,
} from "../src/run.ts";
import { fixture, report } from "./helpers.ts";

const evidence = {
  summary: "Verified fixture behavior",
  futureScope: { version: 2 },
  checks: [
    {
      name: "Actual fixture assertion",
      passed: true,
      evidence:
        "README contents and ownership checked in the temporary project",
      futureTool: { version: 2 },
    },
  ],
};
const quality = {
  summary: "QA and security passed",
  futureContext: { version: 2 },
  decision: "pass" as const,
  qa: evidence,
  security: evidence,
};
async function ready(type: "docs" | "feature" | "research" = "docs") {
  const root = await fixture();
  await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
  await enableTaskTracking(root, {
    revision: (await previewTaskTracking(root)).revision,
  });
  const p = await checkProject(root);
  const old = projectTasks(p).find((task) => task.id === "act-000000");
  if (!old) throw Error("Missing fixture action");
  await editAction(root, { id: old.id, revision: old.revision, cancel: true });
  const id = await createAction(root, {
    type,
    title: "Planned documentation",
    description: "Document the fixture",
    by: "You",
    taskWorkflow: 1,
  });
  const card = async () => {
    const t = projectTasks(await checkProject(root)).find(
      (task) => task.id === id,
    );
    if (!t) throw Error("Missing task");
    return t;
  };
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Prepare workflow fixture"], {
    cwd: root,
  });
  await moveTask(root, {
    id,
    revision: (await card()).revision,
    column: "planning",
  });
  const planning = await startRun(root, "codex", process.pid, "plan");
  if (!planning) throw Error("Planning not queued");
  expect(planning.taskRunKind).toBe("planning");
  await expect(
    guardRun(root, planning.ownerToken, ["README.md"]),
  ).rejects.toThrow(/Planning|QA/);
  const options = [
    { label: "a", description: "Project members", recommended: true },
    { label: "b", description: "Anyone", recommended: false },
  ];
  await publishPlanning(root, planning.ownerToken, {
    action: id,
    kind: "questions",
    questions: [
      {
        text: "Who reads the output?",
        why: "Define access and edge cases",
        options,
      },
    ],
  });
  const qPath = `.voidra/actions/${id}/questions.md`,
    qDoc = (await checkProject(root)).records.get(qPath)?.document;
  if (!qDoc) throw Error("Missing questions");
  const rounds = qDoc.data.rounds as { questions: { id: string }[] }[];
  const question = rounds[0]?.questions[0];
  if (!question) throw Error("Missing question");
  await answerQuestion(root, {
    action: id,
    question: question.id,
    revision: hash(qDoc.raw),
    answer: { kind: "choice", choice: "a" },
    by: "You",
  });
  const resumed = await startRun(root, "codex", process.pid, "plan");
  if (!resumed) throw Error("Answered Planning not queued");
  await publishPlanning(root, resumed.ownerToken, {
    action: id,
    kind: "plan",
    requirements:
      "## Goal\nKeep original fixture content and document installation.\n\n## Out of scope\nOther source changes.",
    blueprint:
      "## Approach\nChange README only.\n\n## Testing seams\nInspect canonical history and rendered text.\n\n## Proposed ADRs\nNone.",
    acceptance:
      "- [ ] The README retains its heading.\n- [ ] QA and security run separately.",
  });
  if (type === "feature") {
    expect((await card()).column).toBe("planning");
    expect(await startRun(root, "codex", process.pid)).toBeNull();
    await approveAction(
      root,
      id,
      "Fixture owner",
      (await getPlanRevision(root, id)).revision,
    );
  }
  expect((await card()).column).toBe("todo");
  expect(await startRun(root, "claude-code", process.pid)).toBeNull();
  async function implement(content: string) {
    await moveTask(root, {
      id,
      revision: (await card()).revision,
      column: "in-progress",
    });
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw Error("Implementation missing");
    expect(ctx.taskRunKind).toBe("implementation");
    await writeFile(join(root, "README.md"), content);
    await prepareResult(root, ctx.ownerToken, {
      ...report,
      reviews: {
        standards: { passed: true, summary: "Fixture standard inspected" },
        plan: { passed: true, summary: "Exact approved plan checked" },
      },
    });
    await commitResult(root, ctx.ownerToken, "Document fixture");
    await finalizeResult(root, ctx.ownerToken);
    expect((await card()).column).toBe("review");
    const qa = await startRun(root, "claude-code", process.pid);
    if (!qa) throw Error("Review not queued");
    expect(qa.taskRunKind).toBe("quality");
    return qa;
  }
  return { root, id, card, implement };
}
it("runs owned QA separately, rejects missing/failed evidence, preserves failure context in TODO, and auto-completes only a fresh passing review", async () => {
  const { root, id, card, implement } = await ready();
  try {
    const qa = await implement("# Fixture\n\nInstallation.\n");
    await expect(publishQuality(root, "wrong-token", quality)).rejects.toThrow(
      /owner|token/,
    );
    await expect(
      publishQuality(root, qa.ownerToken, {
        ...quality,
        questions: [
          {
            text: "Which requirement applies?",
            why: "An unresolved requirement cannot be a passing review.",
            options: [
              { label: "a", description: "Confirm scope", recommended: true },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/questions result/);
    await expect(
      publishQuality(root, qa.ownerToken, {
        ...quality,
        security: { ...evidence, checks: [] },
      }),
    ).rejects.toThrow();
    const failed = {
      summary: "Missing security requirement",
      checks: [
        {
          name: "Security check",
          passed: false,
          evidence:
            "Fixture security check deliberately reports the missing requirement",
        },
      ],
    };
    await expect(
      publishQuality(root, qa.ownerToken, { ...quality, security: failed }),
    ).rejects.toThrow(/Failed/);
    await publishQuality(root, qa.ownerToken, {
      ...quality,
      decision: "rework",
      summary: "Fix the missing security requirement",
      security: failed,
    });
    expect((await card()).column).toBe("todo");
    expect(readActionSequence(await checkProject(root)).pending).not.toContain(
      id,
    );
    expect(
      await readFile(join(root, `.voidra/actions/${id}/action.md`), "utf8"),
    ).toContain("Fix the missing security requirement");
    const fresh = await implement(
      "# Fixture\n\nInstallation and security guidance.\n",
    );
    await publishQuality(root, fresh.ownerToken, quality);
    expect((await card()).column).toBe("done");
    const result = [...(await checkProject(root)).records.values()].find(
      (record) =>
        record.kind === "run" && record.document.data.id === fresh.run,
    );
    expect(result?.document.data.quality).toMatchObject({
      futureContext: { version: 2 },
      qa: {
        futureScope: { version: 2 },
        checks: [{ futureTool: { version: 2 } }],
      },
    });
    expect((await checkProject(root)).diagnostics).toEqual([]);
    expect(readActionSequence(await checkProject(root)).pending).not.toContain(
      id,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("returns new requirements to Planning with prior implementation/review history and refuses outside edits during QA", async () => {
  const { root, id, card, implement } = await ready();
  try {
    const qa = await implement("# Fixture\n\nInstallation.\n");
    await writeFile(join(root, "outside.txt"), "An outside edit");
    await expect(publishQuality(root, qa.ownerToken, quality)).rejects.toThrow(
      /Source changed/,
    );
    await rm(join(root, "outside.txt"));
    await publishQuality(root, qa.ownerToken, {
      ...quality,
      decision: "questions",
      summary: "Clarify the security boundary",
      questions: [
        {
          text: "Who can read the output?",
          why: "The security scope is incomplete",
          options: [
            { label: "a", description: "Project members", recommended: true },
            { label: "b", description: "Anyone", recommended: false },
          ],
        },
      ],
    });
    expect((await card()).column).toBe("planning");
    const p = await checkProject(root),
      a = p.records.get(`.voidra/actions/${id}/action.md`)?.document.data;
    expect(a?.commits).toHaveLength(1);
    expect(a?.reviewHistory).toHaveLength(1);
    expect(
      p.records.get(`.voidra/actions/${id}/questions.md`)?.document.data.rounds,
    ).toHaveLength(2);
    expect(p.diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("retains Feature exact approval, then binds QA to the unchanged approved plan", async () => {
  const { root, id, card, implement } = await ready("feature");
  try {
    const qa = await implement("# Fixture\n\nInstallation.\n");
    const path = join(root, `.voidra/actions/${id}/blueprint.md`);
    await writeFile(
      path,
      `${await readFile(path, "utf8")}\nOutside plan edit.\n`,
    );
    await expect(publishQuality(root, qa.ownerToken, quality)).rejects.toThrow(
      /context changed|changed outside|approval/,
    );
    expect((await card()).column).toBe("review");
    expect((await card()).status).not.toBe("complete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("reviews real read-only Research findings without fabricating an implementation commit", async () => {
  const { root, id, card } = await ready("research");
  try {
    await moveTask(root, {
      id,
      revision: (await card()).revision,
      column: "in-progress",
    });
    const run = await startRun(root, "codex", process.pid);
    if (!run) throw Error("Research not queued");
    await publishResearch(root, run.ownerToken, {
      findings: "README is local Markdown with its original heading.",
      recommendation: "Retain the existing heading.",
      ideas: [],
    });
    expect((await card()).column).toBe("review");
    const qa = await startRun(root, "claude-code", process.pid);
    if (!qa) throw Error("Research review not queued");
    await publishQuality(root, qa.ownerToken, quality);
    expect((await card()).column).toBe("done");
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps initialized submodule source, HEAD and tags read-only during owned QA", async () => {
  const { root, implement } = await ready();
  const child = join(root, "components/extension");
  const git = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git(root, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      "-q",
      root,
      "components/extension",
    ]);
    git(child, ["config", "user.name", "Voidra Verification"]);
    git(child, ["config", "user.email", "verification@example.test"]);
    git(root, ["commit", "-qm", "Record child baseline"]);
    const qa = await implement("# Fixture\n\nInstallation.\n");
    await writeFile(join(child, "README.md"), "Outside child edit\n");
    await expect(publishQuality(root, qa.ownerToken, quality)).rejects.toThrow(
      /Source changed/,
    );
    git(child, ["restore", "README.md"]);
    git(child, ["tag", "outside-tag"]);
    await expect(publishQuality(root, qa.ownerToken, quality)).rejects.toThrow(
      /Submodule.*changed/,
    );
    git(child, ["tag", "-d", "outside-tag"]);
    const head = git(child, ["rev-parse", "HEAD"]);
    git(child, ["commit", "--allow-empty", "-qm", "Outside child commit"]);
    await expect(publishQuality(root, qa.ownerToken, quality)).rejects.toThrow(
      /Submodule.*changed/,
    );
    git(child, ["reset", "--hard", head]);
    await publishQuality(root, qa.ownerToken, quality);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
