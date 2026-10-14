# Assisted reverting of completed work

[V2 index](Intro.md)

## Problem and built baseline

V1 undo applies to app planning edits before consumption; [undo](../../../apps/desktop/src/project-service/undo.ts) refuses finished agent work. Actual [Git trailers](../../../tools/run-engine/src/git.ts) link action and rework commits. [P10 evidence](../../verification/p10.md) proves this boundary, including interrupted runs.

## Proposed design

Create a new revert action that identifies the original action's exact commits, later dependencies and intended result. Discovery checks whether later work relies on the change. The plan previews the reverse diff and testing seams, obtains exact approval and then lets the agent perform a new reverting commit through the ordinary runtime. Preserve the original action/run/release history and link the new action bidirectionally. Reverting released work does not move old tags; a later release carries the correction.

## Format and compatibility

Optional `reverts` references and target commit hashes are additive. A dedicated type is optional future scope and would need new lifecycle/reader tests. Existing commit history is immutable; cancellation/Done must not masquerade as repository rollback.

## App and skills

Offer Create revert from completed work with dependency warnings and a preview. Go uses the same ownership, input guards, reviews and separate Git index; the app creates no code revert itself.

## Risks and open questions

Decide mainline selection for merge commits, missing/squashed history and multi-commit action ordering. Stop on overlapping user edits or conflicts; never reset or force-push to simulate undo.

## Dependencies and verification

Depends on v1 Git/run/review and Release history. Test real multi-commit rework, dependents, conflict preservation, interrupted revert recovery and old tags remaining fixed. The existing undo contract remains unchanged.
