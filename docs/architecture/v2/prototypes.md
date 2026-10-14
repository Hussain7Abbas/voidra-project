# Prototype actions

[V2 index](Intro.md) · [Maps](maps.md)

## Problem and built baseline

[The action schema/lifecycles](../../../packages/voidra/src/schemas.ts) currently expose seven types and exact gates. [Research](../../../tools/run-engine/src/run.ts) deliberately writes no source, while implementation results use guarded commits. [Release candidates](../../../packages/voidra/src/releases.ts) currently admit completed non-Release work; they must not accidentally ship throwaway prototypes.

## Proposed design

Introduce Prototype for a bounded experiment with an explicit question, evidence target, time/effort boundary and disposal/adoption plan. Require Plan approval before source changes and Review of findings. Prefer an isolated worktree/branch; prototype completion records what was learned, not production readiness. Adopting code creates a separately planned implementation action with real acceptance checks. Discard requires an explicit inspected decision and recoverable snapshot, never automatic deletion of user work.

## Format and compatibility

A new type/lifecycle/result disposition is an additive new form only when a higher `requiredVoidra` prevents older readers from acting on it. If existing required meanings change, use a format migration instead. Add source-action/evidence/adoption links and an explicit release-eligibility rule; throwaway Done is excluded from normal release selection.

## App and skills

Add experiment limits/findings and adopt/discard proposal controls. Go uses the same ownership, guards, reviews and journals; architecture dispatch states the experiment's seams. Never skip tests merely because the implementation is temporary.

## Risks and open questions

Choose the minimum verification standard, retention policy and treatment of dependency links to experiments. Budget exhaustion is an interrupted/incomplete finding, not successful acceptance. Isolation must preserve source and planning consistency during later integration.

## Dependencies and verification

Depends on v1 lifecycle/Release rules; [parallel worktrees](parallel-runs.md) improve isolation. Test reader gating, stale approvals, interrupted experiments, adoption conflicts, explicit disposal and exclusion from release candidates.
