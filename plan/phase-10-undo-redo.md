# P10 — Undo and redo

> **Milestone:** M3 · **Needs:** P07 · **Status:** see [main.md](main.md)

## Outcome

⌘Z and ⇧⌘Z undo and redo every edit you make in the app before an agent acts on it, and the history survives restarts (VISION.md section 9).

## Requirements

### In scope

- **An operation log** per project in the SQLite database. Each entry holds a label, the time, and the before and after content of every file it changed, with hashes.
- **One writer.** Every edit goes through an undo-aware writer:
  - ideas, actions, promotions and deletions;
  - profile edits and answers;
  - gate decisions;
  - queue changes.
- **Blocking rules.**
  - Undo is blocked as soon as the P03 persisted run-start record says the agent consumed the item after the edit, before any work begins. This includes linked ideas, profile answers and other records listed as consumed, not just `action.md`.
  - A completed result or stage advancement is additional evidence, never a prerequisite. Blocking survives a crash, a cleared dead-owner lock and an app restart. Redo checks the same rule.
  - Voidra explains why, and suggests creating a revert action for finished work.
- **Changes on disk.** If a file's current hash differs from the logged "after" hash, undo asks before overwriting.
- **Menu and shortcuts.** Edit menu items and shortcuts, each showing what it will undo, for example "Undo Promote idea".
- **History limit.** A per-project limit on history size, chosen and recorded in an ADR.

### Out of scope

Undoing git commits, including the planning commit. A commit is reversed with a revert action, as the vision says.

## Blueprint

- The log stores only `.voidra/` files, which are small. Large bodies are stored once and referenced by hash.
- Undo writes through the same writer, so redo works the same way.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P10-01 | Operation log and undo-aware writer | 5 | — | Every editing call goes through the writer. A test fails if any doesn't. |
| P10-02 | Undo and redo engine | 5 | P10-01 | Undo and redo restore exact bytes, across restarts. |
| P10-03 | Blocking rules | 3 | P10-02, P03-11 | A persisted start marker blocks undo and redo before the fake agent writes code or completes a result. Interrupted runs with an unchanged stage stay blocked across restart and lock recovery, including consumed linked records. The explanation identifies the consuming run. |
| P10-04 | Changes on disk | 3 | P10-02 | A changed file asks before overwriting, and **Cancel** changes nothing. |
| P10-05 | Menu and shortcuts | 2 | P10-02 | The labels describe the action. The shortcuts work in every screen except while typing in a text field, where they undo text instead. |

## Tests

- **Unit:** the log, the engine, the blocking rules, hash checks and the history limit.
- **End-to-end:** undo a promotion, a profile edit and an answer; undo after a restart; block undo and redo while a fake agent is paused immediately after its start marker; kill that agent without a result or stage change and keep blocking after restart/recovery; the changed-on-disk prompt.

## Failure and recovery

- If the log is corrupt, only undo history is lost. The app keeps working and says so.
- Undo never deletes a file an agent created.

## Exit criteria

Every story is accepted, and every editing path is covered by the writer test.

## Hand-off

- Build the undo-aware writer first and route every existing editing path through it before adding any UI. The P10-01 test is the safety net for later phases.
