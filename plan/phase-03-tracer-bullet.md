# P03 — Tracer bullet

> **Milestone:** M1 · **Needs:** P01, P02 · **Status:** see [main.md](main.md)

## Outcome

The thinnest complete loop:

1. Create a Docs/chore action in the app and queue it.
2. Run `/voidra-go` in Claude Code or `$voidra-go` in Codex.
3. Watch the result appear in the app, accept it, and the action is Done.

This proves the format, the app, a skill and the agents work together before any feature is widened.

## Requirements

### In scope

- The project service loads `.voidra/` through the `voidra` package and keeps a rebuildable SQLite index (`better-sqlite3`), starting with actions and runs.
- A debounced file watcher. It recognises the app's own writes so they don't come back as outside changes. An ADR picks the watcher library.
- A minimal **Create `.voidra/`** button for a folder without one: `voidra.json`, `README.md` and `.gitignore`, with no template yet. P04 replaces it.
- Create a Docs/chore action, list actions, and show an action page with sanitised Markdown rendering.
- A run panel:
  - queueing writes `.voidra/local/pending-actions.md`;
  - it shows the command for each agent with a copy button;
  - it shows **Agent running** while `run.lock` exists.
- The review gate: **Accept** moves the action to Done. **Reject** with feedback sends it back to Implement.
- `voidra-go` skill v0, for Docs/chore actions only:
  - read the queue, acquire the lock exclusively, and persist the run-start record and consumed record IDs before doing work;
  - do the work and run `npx voidra@0 check`;
  - use the P01 write/recovery helpers, prepare the run result and Review state, commit with `Voidra-Action` and `Voidra-Run` trailers, reconcile the completed result, and release only the lock it owns.
  - Other types get a "not supported yet" run result.
- `tools/fake-agent`: scripted scenarios that write exactly what the skill writes and make the commit.
- `make skills-link`: symlinks the repository's skills into the Claude Code and Codex skill folders for development. Check both folder locations against current documentation; don't assume them.

### Out of scope

Other action types, questions, plans, onboarding, the board and teams.

## Blueprint

- The index is a cache. If the index is missing, its schema version changes, or it is corrupt, the service rebuilds it from the files.
- A lock whose heartbeat is older than a threshold is shown as "the agent may have stopped", with **Recover run**. The threshold is set in this phase and recorded in an ADR. A stale heartbeat alone never permits clearing a live owner's lock: check PID/process-start identity and owner token. Clearing a dead owner's lock does not erase the persisted start record or undo blocking. A resumed old owner must detect loss of its token and stop before another write.
- Persist a checkpoint before each external side effect. Reconcile an interrupted commit using its action and run trailers before retrying; never repeat a commit that already exists. The commit may contain a prepared result with `commit` unset, because it cannot contain its own hash. Final metadata is recovered from the trailer and atomically written afterward; it is a planning change for the next planning commit, not an amended or second implementation commit.
- File watchers defer indexing related files while a journaled operation is unfinished, show a recovery notice and rebuild after recovery. They never present partial cross-file writes as a completed action.
- `voidra-go` lives in `skills/voidra-go/`. `SKILL.md` stays short; the generated format and lifecycle references live in `references/`.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P03-01 | Load, validate and index a project | 5 | — | Fixture projects load. Validation problems appear with the file and field. Deleting the index rebuilds it with the same content. |
| P03-02 | Watcher and live updates | 3 | P03-01 | Outside edits appear in under a second. The app's own writes don't cause duplicate updates. |
| P03-03 | Minimal `.voidra/` creation | 2 | P03-01 | Creates a folder that passes `voidra check`. |
| P03-04 | Create a Docs/chore action | 3 | P03-03 | The new `action.md` passes `voidra check` and appears in the list straight away. |
| P03-05 | Action list and action page | 3 | P03-04 | Shows the stage, status, description and run results. Markdown is sanitised. |
| P03-06 | Queue and run panel | 3 | P03-05 | The queue file is valid. The copy button copies the right command for each agent. The lock state shows live. |
| P03-07 | `voidra-go` v0 | 5 | P01 | The golden outputs pass `voidra check`. The commit carries the trailer. Unsupported types get a clear run result. |
| P03-08 | Review gate | 3 | P03-05 | Accept moves the action to Done. Reject saves the feedback and returns the action to Implement. |
| P03-09 | Fake agent | 3 | P03-07 | Scenarios for success, an invalid write, a crash mid-run and a stale lock. |
| P03-10 | Skill linking and a real-agent check | 2 | P03-07 | `make skills-link` works for both agents. The agent runs `voidra-go` once with Claude Code and once with Codex, using the real-agent check procedure, and records both. This is the M1 proof. |
| P03-11 | Run start, lock ownership and retry recovery | 5 | P03-07, P01-13 | Before any work, the valid start record identifies consumed records. Two local starts allow only one owner. Tests interrupt before commit, after commit and before result finalization; recovery preserves outside edits, finds the existing trailer and creates no duplicate commit. An active owner cannot be cleared, and repeated recovery produces the same outcome. |

## Tests

- **Unit:** the queue writer, lock and staleness detection, index rebuild and watcher echo suppression.
- **End-to-end (fake agent):** create → queue → run → see the result → accept; reject → rework → accept; an invalid write shows an error; a crash before commit keeps the action from advancing, with a warning; a crash after commit is reconciled rather than committed again. Include competing starts, a live owner with an old heartbeat and an interrupted operation.

## Failure and recovery

- An invalid file written by an agent is shown on the action with its path. The app never repairs files silently.
- A start record without a completed result after the lock disappears shows "the run ended without a completed result" and offers recovery. It does not advance the stage until checkpoint reconciliation determines what succeeded. The start record remains evidence that the agent consumed the item.

## Exit criteria

Every story is accepted, M1 is shown with the fake agent in CI and once with each real agent through the real-agent check procedure, and the evidence file records both.

## Hand-off

- Keep everything minimal. This phase proves the path; P06–P09 widen it.
- Skills must call `npx voidra@0 check`, pinned to the major version, after every completed single-file write or grouped operation, and stop on unresolved recovery conflicts.
