import { createHash } from "node:crypto";
import { VoidraError } from "./errors.ts";
import { type Action, type Approval, stages, types } from "./schemas.ts";
export type Stage = (typeof stages)[number];
export interface Lifecycle {
  stages: Stage[];
  planGate: boolean;
  rejectTo: Stage;
}
export type Lifecycles = Record<Action["type"], Lifecycle>;
const implementation: Lifecycle = {
  stages: ["discovery", "plan", "implement", "verify", "review", "done"],
  planGate: true,
  rejectTo: "implement",
};
export const lifecycles: Lifecycles = {
  feature: { ...implementation, stages: [...implementation.stages] },
  bug: { ...implementation, stages: [...implementation.stages] },
  improvement: { ...implementation, stages: implementation.stages.slice(1) },
  "profile-change": { ...implementation, stages: [...implementation.stages] },
  docs: {
    stages: ["implement", "review", "done"],
    planGate: false,
    rejectTo: "implement",
  },
  research: {
    stages: ["discovery", "review", "done"],
    planGate: false,
    rejectTo: "discovery",
  },
  release: {
    stages: ["plan", "review", "released"],
    planGate: false,
    rejectTo: "plan",
  },
};
export function validateLifecycles(rules: Lifecycles): string[] {
  const errors: string[] = [];
  for (const type of types) {
    const rule = rules[type];
    if (!rule || !Array.isArray(rule.stages)) {
      errors.push(`${type}: missing lifecycle`);
      continue;
    }
    const path = rule.stages;
    if (
      new Set(path).size !== path.length ||
      path.some((stage) => !stages.includes(stage)) ||
      path.length < 2
    )
      errors.push(`${type}: invalid stages`);
    if (!path.includes("review") || path.indexOf("review") !== path.length - 2)
      errors.push(`${type}: preserve the review gate before completion`);
    if (
      !path.includes(rule.rejectTo) ||
      ["review", "done", "released", "cancelled"].includes(rule.rejectTo)
    )
      errors.push(`${type}: invalid rejection target`);
    if (typeof rule.planGate !== "boolean")
      errors.push(`${type}: planGate must be boolean`);
    if (
      rule.planGate &&
      (!path.includes("plan") ||
        !path.includes("implement") ||
        path.indexOf("plan") > path.indexOf("implement"))
    )
      errors.push(`${type}: plan gate requires Plan before Implement`);
    if (
      lifecycles[type].planGate &&
      (!rule.planGate ||
        !path.includes("plan") ||
        path.indexOf("plan") > path.indexOf("implement"))
    )
      errors.push(`${type}: preserve the plan gate before implementation`);
    if (
      type === "research" &&
      (path.includes("implement") || path.includes("verify"))
    )
      errors.push("research: no implementation stages");
    if (
      type === "release" &&
      (rule.planGate ||
        path.includes("done") ||
        path.at(-1) !== "released" ||
        !path.includes("plan"))
    )
      errors.push("release: review authorizes agent finalization");
    if (
      type !== "release" &&
      (path.at(-1) !== "done" || path.includes("released"))
    )
      errors.push(`${type}: finish at done`);
  }
  return errors;
}
export const planFiles = [
  "requirements.md",
  "blueprint.md",
  "acceptance.md",
] as const;
export function hash(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}
export interface PlanRevision {
  hashes: Approval["hashes"];
  revision: string;
}
export function planRevision(
  files: Record<(typeof planFiles)[number], string | Uint8Array>,
): PlanRevision {
  const hashes = {
    "requirements.md": hash(files["requirements.md"]),
    "blueprint.md": hash(files["blueprint.md"]),
    "acceptance.md": hash(files["acceptance.md"]),
  };
  return { hashes, revision: hash(JSON.stringify(hashes)) };
}
export function approvalCurrent(
  approval: Approval | undefined,
  plan: PlanRevision | undefined,
): boolean {
  return Boolean(
    approval &&
      plan &&
      planFiles.every((file) => approval.hashes[file] === plan.hashes[file]),
  );
}
export type LifecycleEvent =
  | "advance"
  | "approve-plan"
  | "reject-plan"
  | "accept-review"
  | "reject-review"
  | "finalize-release"
  | "cancel";
export interface TransitionContext {
  plan?: PlanRevision;
  questionsOpen?: boolean;
  revision?: string;
  reviewRevision?: string;
  by?: string;
  at?: string;
  commit?: string;
  tag?: string;
}
export interface TransitionResult {
  action: Action;
  notice?: string;
}
export function transition(
  action: Action,
  event: LifecycleEvent,
  context: TransitionContext,
  rules: Lifecycles = lifecycles,
): TransitionResult {
  const fail = (message: string): never => {
    throw new VoidraError("transition", action.id, message, "stage");
  };
  if (validateLifecycles(rules).length) fail("Invalid lifecycle override");
  const rule = rules[action.type];
  const stage = action.stage;
  if (
    action.doneBy !== "agent" ||
    !stage ||
    (!rule.stages.includes(stage) &&
      stage !== "cancelled" &&
      stage !== "released")
  )
    fail("Action has no valid agent stage");
  if (["done", "released", "cancelled"].includes(stage as string))
    fail("Terminal action cannot transition");
  if (event === "cancel")
    return { action: { ...action, stage: "cancelled", status: "complete" } };
  if (context.questionsOpen) fail("Answer open questions before continuing");
  if (
    rule.planGate &&
    ["implement", "verify", "review"].includes(stage as string) &&
    !approvalCurrent(action.planApproval, context.plan)
  )
    return {
      action: { ...action, stage: "plan", status: "waiting" },
      notice:
        "Plan approval is stale; approve the current files before resuming",
    };
  if (
    action.type === "release" &&
    stage === "review" &&
    action.reviewDecision?.decision === "accepted" &&
    action.reviewDecision.revision !== context.plan?.revision
  ) {
    const { reviewDecision: _decision, ...rest } = action;
    return {
      action: { ...rest, status: "waiting" },
      notice: "Release review approval is stale",
    };
  }
  const decision = (): { by: string; at: string } => {
    if (!context.by || !context.at) fail("Decision requires author and time");
    return { by: context.by as string, at: context.at as string };
  };
  if (event === "approve-plan") {
    if (stage !== "plan" || !rule.planGate)
      fail("No plan approval gate at this stage");
    if (!context.plan || context.revision !== context.plan.revision)
      fail("Plan revision changed or files are missing");
    const approval: Approval = {
      ...decision(),
      hashes: (context.plan as PlanRevision).hashes,
    };
    return {
      action: {
        ...action,
        planApproval: approval,
        approvalHistory: [
          ...(action.approvalHistory ?? []),
          ...(action.planApproval ? [action.planApproval] : []),
        ],
        stage: rule.stages[rule.stages.indexOf("plan") + 1] as Stage,
        status: "ready",
      },
    };
  }
  if (event === "reject-plan") {
    if (stage !== "plan" || !rule.planGate) fail("No plan gate at this stage");
    return { action: { ...action, status: "ready" } };
  }
  if (event === "accept-review" || event === "reject-review") {
    if (stage !== "review") fail("No review gate at this stage");
    const current =
      action.type === "release"
        ? context.plan?.revision
        : context.reviewRevision;
    if (!current || context.revision !== current)
      fail("Review revision changed");
    const accepted = event === "accept-review";
    return {
      action: {
        ...action,
        reviewDecision: {
          ...decision(),
          revision: current as string,
          decision: accepted ? "accepted" : "rejected",
        },
        stage: accepted
          ? action.type === "release"
            ? "review"
            : "done"
          : rule.rejectTo,
        status: accepted && action.type !== "release" ? "complete" : "ready",
      },
    };
  }
  if (event === "finalize-release") {
    if (
      action.type !== "release" ||
      stage !== "review" ||
      action.reviewDecision?.decision !== "accepted" ||
      !context.commit ||
      !context.tag
    )
      fail("Release requires accepted review, commit and tag evidence");
    return {
      action: {
        ...action,
        stage: "released",
        status: "complete",
        commits: [...(action.commits ?? []), context.commit as string],
        releaseTag: context.tag,
      },
    };
  }
  if (action.type === "release" && stage === "plan" && !context.plan)
    fail("Release review requires valid plan files");
  if (stage === "review") fail("Human review is required");
  if (stage === "plan" && rule.planGate) fail("Plan approval is required");
  const next = rule.stages[rule.stages.indexOf(stage as Stage) + 1];
  if (!next) fail("No next stage");
  return {
    action: {
      ...action,
      stage: next as Stage,
      status:
        next === "review" || (next === "plan" && rule.planGate)
          ? "waiting"
          : "ready",
    },
  };
}
