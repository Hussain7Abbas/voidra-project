# Personal queue

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/local/pending-actions.md`

Legacy frontmatter: required `queuedBy`, `queuedAt`. Body: ordered Markdown checklist of action IDs. Each ID exists, is unique and belongs to an agent action. Eligibility can change after a run reaches a gate, so checking the file validates references rather than automatically removing waiting entries.

## Example

```markdown
---
queuedBy: You
queuedAt: 2026-10-13T00:00:00Z
---

```

The Run screen lists eligible agent work with yours and unassigned actions first. Add, remove and move controls persist the ordered queue immediately. Each edit compares the displayed queue revision and action revisions; changing files or starting a run requires a refresh or recovery. Explicit Profile change drafts activate on their action page rather than in the picker.

In legacy projects, when you update a saved queue, the desktop removes entries that have since become ineligible. Their current reason is shown in the Run list before the update. Runtime startup checks eligibility again and consumes the queue in order.

## Versioned Actions intent (reader 1.1.0)

Projects with `taskTracking: 1` may use `.voidra/local/action-sequence.json`: `{ "version": 1, "order": ["act-000000"] }`. Pair it with `orderedIntent: 1` in `pending-actions.md`. The versioned pair is required together; malformed/newer state never falls back to legacy interpretation. Actor/time may be absent on deterministic initial bootstrap, and explicit edits record both. Both files stay private and out of Git.

The sequence retains active TODO/running/waiting tasks, including human prerequisites, until Backlog, completion or cancellation. A new TODO agent task receives one pending execution request. Starting a run consumes only its request; the task remains in the visible sequence. Reordering never replenishes a consumed/failed request. Use explicit queueing after resolving a gate or deciding to retry.

The right Actions sidebar always edits the complete global order, independent of board filters. Pointer grips, Up/Down arrows and buttons use identical displayed sequence, queue and task hashes. Dependency warnings include transitive later/absent prerequisites. Optional Rearrange uses a stable topological ordering of existing entries; it never inserts absent work. Ignoring a warning retains the order but grants no execution permission.

Runtime chooses the first eligible pending request in this order. It skips blocked/gated requests without removing them, rechecks existing `queueDecision` rules, and returns null when none qualify. Legacy queues retain strict first-entry behavior. New runs store an `orderedIntent` version/hash receipt so local undo recognizes consumed ordering; it carries no private-file references requiring those files in a clone. Existing ownership, source, approval and recovery guards still apply.

New task-tracking upgrades bootstrap the pair in the exact migration preview/write. Already tracked projects preview conversion before enabling it. Reorder/enrollment/Backlog removal use grouped writes and persistent app undo. Run consumption blocks replay of earlier ordering even after restart. Unknown/missing/corrupt intent remains visible as a problem and is never silently repaired by a read.
