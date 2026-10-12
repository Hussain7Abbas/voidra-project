import { stringify } from "yaml";
export const time = "2026-10-13T00:00:00Z";
export const samples = {
  project: {
    format: 1,
    requiredVoidra: "0.1.0",
    project: { id: "prj-000000", name: "Example" },
    template: null,
    createdWith: "voidra/0.1.0",
  },
  profile: {
    block: "problem",
    title: "Problem",
    answers: [
      {
        id: "goal",
        question: "What is the goal?",
        answer: "A working example",
        status: "confirmed",
      },
    ],
  },
  idea: { id: "idea-000000", title: "An idea", status: "new" },
  action: {
    id: "act-000000",
    type: "feature",
    title: "An action",
    stage: "discovery",
    status: "ready",
    doneBy: "agent",
  },
  questions: {
    action: "act-000000",
    rounds: [
      {
        round: 1,
        askedAt: time,
        questions: [
          {
            id: "q-000000",
            text: "Which option?",
            why: "Defines scope",
            options: [
              { label: "a", description: "Small scope", recommended: true },
            ],
            allowFreeText: true,
            answer: { kind: "choice", choice: "a", by: "You", at: time },
          },
        ],
      },
    ],
  },
  requirements: { action: "act-000000" },
  blueprint: { action: "act-000000" },
  acceptance: { action: "act-000000" },
  run: {
    id: "run-000000",
    action: "act-000000",
    agent: "codex",
    startedAt: time,
    consumedRecords: ["act-000000"],
    fromStage: "discovery",
    outcome: "running",
  },
  release: { version: "0.1.0", actions: ["act-000000"], status: "draft" },
  queue: { queuedBy: "You", queuedAt: time },
  lock: {
    ownerToken: "owner",
    pid: 123,
    processStartedAt: "identity",
    agent: "codex",
    host: "localhost",
    run: "run-000000",
    action: "act-000000",
    startedAt: time,
    heartbeatAt: time,
  },
  operation: {
    id: "op-000000",
    fingerprint: "0".repeat(64),
    state: "committed",
    changes: [
      {
        path: ".voidra/README.md",
        expectedHash: null,
        before: null,
        after: "Guide",
      },
    ],
  },
};
export const bodies: Record<string, string> = {
  requirements: "## Goal\nA working example.\n## Out of scope\nOther work.\n",
  blueprint:
    "## Approach\nA small change.\n## Testing seams\nPublic API.\n## Proposed ADRs\nNone.\n",
  acceptance: "- The example works.\n",
};
export function markdown(data: unknown, body = ""): string {
  return `---\n${stringify(data)}---\n${body}`;
}
