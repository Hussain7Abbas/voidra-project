# V11-P06 — Actions implementation sequence

> **Needs:** P05 · **Status:** Done — 2026-10-15 · **Confirmed:** C01 · **Proposal:** A03

## Outcome

The right Actions sidebar lists the intended implementation sequence, including visible blockers and an optional dependency-order repair.

## Requirements

In scope: TODO enrollment, draggable ordering, dependency warnings, Rearrange and standalone execution integration. Out of scope: executing blocked work, launching agents from the app or changing the meaning of exact approvals.

## Blueprint

One task is one executable action (C01), so sequence entries point to those tasks; larger work uses separately linked child tasks rather than an undisclosed second action list inside a card. Entering TODO enrolls a ticket once at the sequence end by default; do not enroll every Backlog item. Propose retaining already enrolled running/waiting work with its status until completion/cancellation; returning an unstarted task to Backlog removes it. Define these membership rules and undo together. Never make an auto-enrollment double entry after watcher refresh/restart.

Existing `queueDecision` rejects blocked work; simply weakening it would violate standalone safety. Introduce explicit ordered intent, with a compatible private-file representation or versioned extension and minimum-reader policy. The runnable adapter and both clients recheck dependencies, human gates, assignment and revisions at consumption time. Preserve current run ownership/recovery semantics. Keep a blocked intent visible with its reason; a permitted later task can run only under the documented selection policy.

Warn when an unfinished dependency appears later than its dependent, including transitive dependencies. **Rearrange** applies a stable topological ordering to the visible sequence, preserving unrelated relative order and not silently adding absent dependencies. Missing dependencies show a concrete explanation; cycles remain validation errors. Reordering while filtered must preserve unseen tasks. Doing nothing keeps the chosen order and the nonmodal warning; it never permits blocked execution.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P06-01 | TODO to Actions enrollment | 5 | P05 | A TODO move appends exactly once; Backlog/completion/cancellation and undo follow documented rules across restart. |
| V11-P06-02 | Draggable ordered intent | 5 | 01 | Pointer drag and keyboard reorder persist the same global sequence; filtered reorders preserve hidden entries and stale revisions refuse writes. |
| V11-P06-03 | Warn and Rearrange | 5 | 02 | Putting a dependent first warns and offers Rearrange; ignoring keeps the order; Rearrange stably puts prerequisites first without inventing tasks. |
| V11-P06-04 | Safe standalone consumption | 8 | 03 | Both clients see consistent intended/runnable order, refuse blocked/gated work and retain lock/recovery/consumption protection after interruption. |

## Tests

Real temporary dependency graphs and queues: chains, diamonds, absent/cancelled/human blockers, slices, cycles and external changes. Desktop drag/warning/ignore/rearrange workflows. Run-engine integration verifies no blocked implementation even after dismissing/ignoring warnings. Actual both-agent checks are required for changed queue/skill semantics; record commands/model IDs in evidence.

## Failure and recovery

Conflicts refresh the sequence while preserving the user's intended reorder for review. Active/unfinished runs follow existing mutation restrictions. Preview a compatible private queue conversion; no unsafe read-as-old-queue fallback. Unrecoverable cycles show diagnostics rather than auto-removing dependency edges.

## Exit criteria

All stories, `make check` and actual affected two-agent checks pass. The Actions sidebar is functional; P07 finishes shared toggling/resizing.

## Hand-off

Update run/queue architecture, public skill guidance and generated runtime copies. Document ordered intent separately from execution eligibility for P07 and P10.

All four stories are complete. [Executed verification](../docs/verification/v1.1.0-p06.md) records 461 passing quality tests, actual desktop ordering/Kanban checks and both actual coding clients, including their small-model limitations and required default retries.
