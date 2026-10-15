import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  answerQuestion,
  applyOperation,
  approveAction,
  checkProject,
  createAction,
  decideReview,
  getPlanRevision,
  hash,
  parseRecord,
  planFiles,
  planRevision,
  requestPlanChanges,
  reviewRevision,
  schemas,
  serializeRecord,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";
import { bodies, markdown, samples, time } from "./samples.ts";

it.each(["feature", "improvement"] as const)(
  "saves partial %s question rounds, records actor/time and delegation, and refuses unseen outside revisions",
  async (type) => {
    const root = await materialize(minimalFiles());
    try {
      const action = await createAction(root, {
          type,
          title: "Save notes",
          description: "Save private notes.",
          by: "You",
        }),
        path = `.voidra/actions/${action}/questions.md`,
        actionPath = `.voidra/actions/${action}/action.md`,
        raw = await readFile(join(root, actionPath)),
        doc = parseRecord(actionPath, raw);
      const options = [
        { label: "a", description: "Owner only", recommended: true },
        { label: "b", description: "A team", recommended: false },
      ];
      await applyOperation(root, {
        changes: [
          {
            path,
            expectedHash: null,
            content: serializeRecord(parseRecord(path, "---\n{}\n---\n"), {
              action,
              rounds: [
                {
                  round: 1,
                  askedAt: new Date().toISOString(),
                  questions: [
                    {
                      id: "q-000000",
                      text: "Who reads notes?",
                      why: "Sets the authorization boundary.",
                      options,
                      allowFreeText: true,
                    },
                    {
                      id: "q-000001",
                      text: "Which storage?",
                      why: "Sets persistence and recovery requirements.",
                      options,
                      allowFreeText: true,
                    },
                  ],
                },
              ],
            }).toString(),
          },
          {
            path: actionPath,
            expectedHash: hash(raw),
            content: serializeRecord(doc, {
              ...doc.data,
              status: "waiting",
            }).toString(),
          },
        ],
      });
      const revision = hash(await readFile(join(root, path)));
      await answerQuestion(root, {
        action,
        question: "q-000000",
        revision,
        answer: { kind: "choice", choice: "a" },
        by: "You",
      });
      let project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      expect(project.records.get(actionPath)?.document.data.status).toBe(
        "waiting",
      );
      await expect(
        answerQuestion(root, {
          action,
          question: "q-000001",
          revision,
          answer: { kind: "text", text: "JSON" },
          by: "You",
        }),
      ).rejects.toThrow(/changed/);
      await answerQuestion(root, {
        action,
        question: "q-000001",
        revision: hash(await readFile(join(root, path))),
        answer: { kind: "agent-decides" },
        by: "You",
      });
      project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      expect(project.records.get(actionPath)?.document.data.status).toBe(
        "ready",
      );
      const rounds = project.records.get(path)?.document.data.rounds as {
        questions: { answer: unknown }[];
      }[];
      expect(rounds[0]?.questions[0]?.answer).toMatchObject({
        kind: "choice",
        choice: "a",
        by: "You",
      });
      expect(rounds[0]?.questions[1]?.answer).toMatchObject({
        kind: "agent-decides",
        by: "You",
      });
      const markdownAnswer =
        "\r\n    Preserve indentation\r\n**العربية** 🧭\r\n";
      await answerQuestion(root, {
        action,
        question: "q-000001",
        revision: hash(await readFile(join(root, path))),
        answer: { kind: "text", text: markdownAnswer },
        by: "You",
      });
      const saved = schemas.questions.parse(
        (await checkProject(root)).records.get(path)?.document.data,
      );
      expect(saved.rounds[0]?.questions[1]?.answer).toMatchObject({
        kind: "text",
        text: markdownAnswer,
      });
      await expect(
        answerQuestion(root, {
          action,
          question: "q-000001",
          revision: hash(await readFile(join(root, path))),
          answer: { kind: "choice", choice: "missing" },
          by: "You",
        }),
      ).rejects.toThrow(/option/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

async function gateFixture(type: string, stage = "review") {
  const files = minimalFiles();
  const id = "act-000000",
    prefix = `.voidra/actions/${id}/`;
  const plans = Object.fromEntries(
    planFiles.map((file) => [
      file,
      markdown({ action: id }, bodies[file.replace(".md", "")]),
    ]),
  ) as Record<(typeof planFiles)[number], string>;
  const gated = ["feature", "bug", "improvement", "profile-change"].includes(
    type,
  );
  files.set(
    `${prefix}action.md`,
    Buffer.from(
      markdown({
        ...samples.action,
        type,
        stage,
        status: "waiting",
        ...(gated && stage === "review"
          ? {
              planApproval: {
                by: "You",
                at: time,
                hashes: planRevision(plans).hashes,
              },
            }
          : {}),
      }),
    ),
  );
  if (gated || type === "release")
    for (const file of planFiles)
      files.set(`${prefix}${file}`, Buffer.from(plans[file]));
  if (stage === "review")
    files.set(
      `${prefix}runs/2026-10-13T00-00-00Z-codex-run-000000.md`,
      Buffer.from(
        markdown(
          {
            ...samples.run,
            outcome: "advanced",
            endedAt: time,
            fromStage:
              type === "research"
                ? "discovery"
                : type === "release"
                  ? "plan"
                  : "implement",
            toStage: "review",
            ...(!["research", "release"].includes(type)
              ? { commit: "abc123" }
              : {}),
            checks: [{ name: "Project checks", passed: true }],
          },
          "## Summary\nCompleted the proposed work.\n## Changed files\nREADME.md\n",
        ),
      ),
    );
  return materialize(files);
}
for (const [type, target] of [
  ["feature", "implement"],
  ["bug", "implement"],
  ["improvement", "implement"],
  ["profile-change", "implement"],
  ["docs", "implement"],
  ["research", "discovery"],
  ["release", "plan"],
]) {
  it(`reviews ${type} at the exact displayed result and returns rejection to ${target}`, async () => {
    const root = await gateFixture(type as string);
    try {
      let project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      const revision = reviewRevision(project, "act-000000");
      await expect(
        decideReview(root, "act-000000", revision, "rejected", "", "You"),
      ).rejects.toThrow(/Explain/);
      await decideReview(
        root,
        "act-000000",
        revision,
        "rejected",
        "\n    Keep the boundary explicit\r\n\r\n**Verify** the fix.\r\n",
        "You",
      );
      project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      expect(
        project.records.get(".voidra/actions/act-000000/action.md")?.document
          .data,
      ).toMatchObject({
        stage: target,
        status: "ready",
        reviewDecision: {
          decision: "rejected",
          feedback:
            "\n    Keep the boundary explicit\r\n\r\n**Verify** the fix.\r\n",
        },
      });
      await expect(
        decideReview(root, "act-000000", revision, "accepted", "", "You"),
      ).rejects.toThrow(/changed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    const accepted = await gateFixture(type as string);
    try {
      await decideReview(
        accepted,
        "act-000000",
        reviewRevision(await checkProject(accepted), "act-000000"),
        "accepted",
        "",
        "You",
      );
      const project = await checkProject(accepted);
      expect(project.diagnostics).toEqual([]);
      expect(
        project.records.get(".voidra/actions/act-000000/action.md")?.document
          .data,
      ).toMatchObject({
        stage: type === "release" ? "review" : "done",
        status: type === "release" ? "ready" : "complete",
      });
    } finally {
      await rm(accepted, { recursive: true, force: true });
    }
  });
}
it("requests a revised plan with durable feedback and refuses concurrent unseen results", async () => {
  const root = await gateFixture("feature", "plan");
  try {
    const plan = await getPlanRevision(root, "act-000000");
    await requestPlanChanges(
      root,
      "act-000000",
      plan.revision,
      "\r\n    Keep indentation\r\n\r\n**Narrow** the acceptance criteria\r\n",
      "You",
    );
    let project = await checkProject(root);
    expect(
      project.records.get(".voidra/actions/act-000000/action.md")?.document
        .data,
    ).toMatchObject({
      stage: "plan",
      status: "ready",
      planFeedback: {
        feedback:
          "\r\n    Keep indentation\r\n\r\n**Narrow** the acceptance criteria\r\n",
        by: "You",
      },
    });
    await approveAction(root, "act-000000", "You", plan.revision);
    project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(
      project.records.get(".voidra/actions/act-000000/action.md")?.document.data
        .planApproval,
    ).toMatchObject({ hashes: plan.hashes });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const review = await gateFixture("research");
  try {
    const revision = reviewRevision(await checkProject(review), "act-000000");
    await expect(
      decideReview(review, "act-000000", revision, "accepted", "", "You", {
        checkpoint: async (point) => {
          if (point === "validated") {
            const path = join(
              review,
              ".voidra/actions/act-000000/runs/2026-10-13T00-00-00Z-codex-run-000000.md",
            );
            const { writeFile } = await import("node:fs/promises");
            await writeFile(
              path,
              `${await readFile(path, "utf8")}Outside edit\n`,
            );
          }
        },
      }),
    ).rejects.toThrow(/conflict/);
    expect(
      (await checkProject(review)).records.get(
        ".voidra/actions/act-000000/action.md",
      )?.document.data.stage,
    ).toBe("review");
  } finally {
    await rm(review, { recursive: true, force: true });
  }
});

it("requires a fresh Release decision after changed plan bytes and records the new hashes", async () => {
  const root = await gateFixture("release");
  try {
    let project = await checkProject(root);
    await decideReview(
      root,
      "act-000000",
      reviewRevision(project, "act-000000"),
      "accepted",
      "",
      "You",
    );
    const file = join(root, ".voidra/actions/act-000000/blueprint.md"),
      { writeFile } = await import("node:fs/promises");
    await writeFile(file, `${await readFile(file, "utf8")} \n`);
    project = await checkProject(root);
    expect(project.diagnostics.map((d) => d.code)).toContain("stale-review");
    await decideReview(
      root,
      "act-000000",
      reviewRevision(project, "act-000000"),
      "accepted",
      "",
      "You",
    );
    project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(
      project.records.get(".voidra/actions/act-000000/action.md")?.document
        .data,
    ).toMatchObject({
      stage: "review",
      status: "ready",
      reviewDecision: {
        decision: "accepted",
        revision: (await getPlanRevision(root, "act-000000")).revision,
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
