import { expect, it } from "vitest";
import {
  lifecycles,
  planRevision,
  transition,
  validateLifecycles,
} from "../src/lifecycle.ts";
import type { Action } from "../src/schemas.ts";

const plan = planRevision({
  "requirements.md": Buffer.from("goal"),
  "blueprint.md": Buffer.from("approach"),
  "acceptance.md": Buffer.from("works"),
});
const action = (type: Action["type"], stage: Action["stage"]): Action =>
  ({
    id: "act-000000",
    type,
    title: "Work",
    stage,
    status: "ready",
    doneBy: "agent",
  }) as Action;
it("validates all default lifecycles and rejects unsafe overrides", () => {
  expect(validateLifecycles(lifecycles)).toEqual([]);
  for (const changed of [
    {
      ...lifecycles,
      research: { ...lifecycles.research, rejectTo: "implement" },
    },
    { ...lifecycles, feature: { ...lifecycles.feature, planGate: false } },
    {
      ...lifecycles,
      release: { ...lifecycles.release, stages: ["plan", "review", "done"] },
    },
    {
      ...lifecycles,
      docs: { ...lifecycles.docs, stages: ["implement", "done"] },
    },
    {
      ...lifecycles,
      bug: { ...lifecycles.bug, stages: ["plan", "plan", "review", "done"] },
    },
  ])
    expect(
      validateLifecycles(changed as typeof lifecycles).length,
    ).toBeGreaterThan(0);
});
it("runs every type through its gates, using current revisions", () => {
  for (const type of Object.keys(lifecycles) as Action["type"][]) {
    let a = action(type, lifecycles[type].stages[0]);
    const ctx = {
      plan,
      by: "You",
      at: "2026-10-13T00:00:00Z",
      revision: plan.revision,
      reviewRevision: plan.revision,
    };
    if (a.stage === "discovery") a = transition(a, "advance", ctx).action;
    if (a.stage === "plan" && lifecycles[type].planGate) {
      expect(() => transition(a, "advance", ctx)).toThrow(/approval/);
      a = transition(a, "approve-plan", ctx).action;
    } else if (a.stage === "plan") a = transition(a, "advance", ctx).action;
    while (a.stage !== "review") a = transition(a, "advance", ctx).action;
    expect(() => transition(a, "advance", ctx)).toThrow(/review/);
    const rejected = transition(a, "reject-review", ctx).action;
    expect(rejected.stage).toBe(lifecycles[type].rejectTo);
    a = transition(a, "accept-review", ctx).action;
    expect(a.stage).toBe(type === "release" ? "review" : "done");
    if (type === "release") {
      expect(() => transition(a, "finalize-release", ctx)).toThrow(/commit/);
      a = transition(a, "finalize-release", {
        ...ctx,
        commit: "abc",
        tag: "v0.1.0",
      }).action;
    }
    expect(a.status).toBe("complete");
  }
});
it("blocks open questions, invalid transitions and stale displayed decisions", () => {
  const a = action("research", "discovery");
  expect(() => transition(a, "advance", { questionsOpen: true })).toThrow(
    /questions/,
  );
  expect(() => transition(a, "approve-plan", {})).toThrow();
  expect(() => transition({ ...a, doneBy: "you" }, "advance", {})).toThrow();
  expect(() =>
    transition(action("research", "implement"), "advance", {}),
  ).toThrow();
  expect(() => transition(action("docs", "done"), "advance", {})).toThrow();
  expect(() =>
    transition(action("research", "review"), "accept-review", {
      revision: "old",
      reviewRevision: plan.revision,
    }),
  ).toThrow(/revision/);
  expect(transition(a, "cancel", {}).action.stage).toBe("cancelled");
  expect(
    transition(action("feature", "plan"), "reject-plan", {}).action.status,
  ).toBe("ready");
});
it("routes stale approvals before rework and checks each exact byte file", () => {
  const approved = transition(action("feature", "plan"), "approve-plan", {
    plan,
    revision: plan.revision,
    by: "You",
    at: "2026-10-13T00:00:00Z",
  }).action;
  for (const file of [
    "requirements.md",
    "blueprint.md",
    "acceptance.md",
  ] as const) {
    const changed = planRevision({
      "requirements.md": Buffer.from("goal"),
      "blueprint.md": Buffer.from("approach"),
      "acceptance.md": Buffer.from("works"),
      [file]: Buffer.from("changed "),
    });
    const result = transition(approved, "advance", { plan: changed });
    expect(result.action.stage).toBe("plan");
    expect(result.notice).toMatch(/stale/);
  }
  expect(transition(approved, "advance", {}).action.stage).toBe("plan");
  expect(() =>
    transition(action("feature", "plan"), "approve-plan", {
      plan,
      revision: "old",
    }),
  ).toThrow(/revision/);
  const r = {
    ...action("release", "review"),
    reviewDecision: {
      revision: plan.revision,
      decision: "accepted",
      by: "You",
      at: "2026-10-13T00:00:00Z",
    },
  } as Action;
  expect(
    transition(r, "finalize-release", {
      plan: planRevision({
        "requirements.md": Buffer.from("new"),
        "blueprint.md": Buffer.from("approach"),
        "acceptance.md": Buffer.from("works"),
      }),
    }).action.stage,
  ).toBe("review");
});
