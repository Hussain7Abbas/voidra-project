import { expect, it } from "vitest";
import { inboxItems } from "../src/renderer/inbox.ts";
import { workspaceSchema } from "../src/shared/bridge.ts";

it("derives every inbox kind from the records, prioritizes questions and stale plans, and excludes finished work", () => {
  const actions = [
    {
      id: "questions",
      status: "waiting",
      stage: "plan",
      questions: {
        path: "q",
        revision: "h",
        rounds: [
          {
            round: 1,
            askedAt: "now",
            questions: [
              {
                id: "q-1",
                text: "Scope?",
                why: "Boundary",
                options: [],
                allowFreeText: true,
              },
            ],
          },
        ],
      },
    },
    { id: "plan", status: "waiting", stage: "plan" },
    {
      id: "stale",
      status: "ready",
      stage: "review",
      effectiveStage: "plan",
      changedPlans: ["acceptance.md"],
    },
    { id: "review", status: "waiting", stage: "review" },
    { id: "person", status: "ready", doneBy: "you" },
    { id: "done", status: "complete", stage: "done" },
  ].map((a) => ({
    data: {
      id: a.id,
      title: a.id,
      status: a.status,
      type: "feature",
      doneBy: a.doneBy ?? "agent",
      ...(a.stage ? { stage: a.stage } : {}),
    },
    body: "",
    path: a.id,
    revision: "h",
    editRevision: "h",
    timeline: [],
    blocked: false,
    effectiveStage: a.effectiveStage ?? a.stage,
    questions: a.questions ?? null,
    changedPlans: a.changedPlans ?? [],
    runs: [],
  }));
  const profiles = [
    {
      path: "p",
      revision: "h",
      body: "",
      data: {
        block: "problem",
        title: "Problem",
        answers: [
          { id: "goal", question: "Goal?", answer: "Ship", status: "inferred" },
          {
            id: "known",
            question: "Known?",
            answer: "yes",
            status: "confirmed",
          },
        ],
      },
    },
  ];
  const input = workspaceSchema.shape.actions.parse(actions),
    profile = workspaceSchema.shape.profiles.parse(profiles);
  expect(
    inboxItems({ actions: input, profiles: profile }).map((i) => [
      i.kind,
      i.id,
    ]),
  ).toEqual([
    ["questions", "q-1"],
    ["plans", "plan"],
    ["plans", "stale"],
    ["reviews", "review"],
    ["human", "person"],
    ["inferred", "problem.goal"],
  ]);
  expect(inboxItems({ actions: [], profiles: [] })).toEqual([]);
});
