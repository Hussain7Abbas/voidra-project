# P12 — Releases and `voidra-sync`

> **Milestone:** M3 · **Needs:** P09 · **Status:** see [main.md](main.md)

## Outcome

You can cut releases from done actions. `.voidra/` also keeps up with work done outside Voidra.

## Requirements

### In scope

- **New release**:
  - pick done, unreleased actions, which creates a Release action;
  - its lifecycle is Plan (version, changelog and notes) → Review → the agent commits the version bump and creates a git tag → Released;
  - the app's Accept records authorization for the exact proposal and plan revision, makes finalization queueable, and keeps the action in Review pending the next agent run. Reject returns it to Plan. Only the agent finalizes it;
  - the included actions become Released.
- **Releases screen:** past releases with their notes, actions and tags.
- **The changelog** follows the project's own convention, for example an existing `CHANGELOG.md`, or uses only the release files if there is none.
- **The `voidra-release` skill:** starts a release from the terminal by collecting done, unreleased actions into a Release action.
- **The `voidra-sync` skill:**
  - finds commits without a `Voidra-Action` trailer since the last sync;
  - updates profile answers they affect, marked inferred;
  - proposes ideas or actions for work that isn't tracked;
  - writes a sync record in `.voidra/syncs/`, one file per sync, which marks where the next sync starts.
- **Sync suggestion:** the app suggests running `voidra-sync` when it finds commits without trailers (from P09).

### Out of scope

Publishing releases anywhere. The tag is local until you push it.

## Blueprint

- Release is an ordinary action type, and its lifecycle comes from the engine (P01).
- The sync record is a new file type, added as an additive format change under `docs/compatibility.md`. Each sync gets its own file, so teammates' syncs never collide in one file.
- Release plans include the three plan files, proposed version/notes and selected action IDs. Review approval fingerprints the full proposal. Recheck it before finalization; a changed plan, notes, version or candidate set returns to review for acceptance again.
- Finalization uses the P01/P03 journal protocol: record the expected release commit and tag, reconcile an already-existing commit through its run trailer, create the tag only for that commit, and then mark the release and its members Released as one recoverable grouped operation. A crash after either commit or tag resumes without another bump/commit/tag. An existing matching tag is a completed step; an unrelated tag with the same name is a conflict and must never be moved.
- Sync records name the examined git revision and proposal identities. An interrupted or repeated sync at that revision reconciles its existing proposals and record instead of creating duplicates or skipping unprocessed commits. Confirmed profile answers remain protected.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P12-01 | New release and the Release action | 5 | — | Only done, unreleased actions can be picked. Release rejection returns to Plan; acceptance records the approved revision and stays in Review pending agent finalization. No version bump or tag is made by the app. |
| P12-02 | Releases screen | 3 | P12-01 | Shows every release with its notes, actions and tag. |
| P12-03 | Release lifecycle in `voidra-go` | 3 | P12-01 | Golden examples: a release plan, and a release commit with a tag. The changelog convention is followed. |
| P12-04 | `voidra-release` skill | 2 | P12-03 | The golden output passes `voidra check`. |
| P12-05 | `voidra-sync` skill | 5 | — | Golden examples: profile updates marked inferred, proposed ideas and a sync record. The new file type has its spec page, schema and generated references. |
| P12-06 | Sync suggestion | 2 | P12-05 | Appears when there are untracked commits, and disappears after a sync. |
| P12-07 | Release and sync retry recovery | 5 | P12-03, P12-05, P03-11 | Interrupt release before/after its commit, tag and grouped Released updates; retries create one commit and tag and reconcile all members. A changed proposal needs acceptance again. Conflicting tags and outside file edits stop recovery. Interrupt sync between proposal creation and its record; rerun produces no duplicate proposals or skipped commits. |
| P12-08 | Release and sync real-agent checks | 3 | P12-04, P12-05, P12-07 | Both agents run `voidra-release`, then `voidra-go` through rejection, acceptance and local tagging; both run `voidra-sync` on an outside-code commit with a confirmed answer protected and repeat it without duplicates. Evidence records the matrix scenarios, commands, models, gates, writes and git state. |

## Tests

- **Unit:** picking release candidates, version checks and untracked-commit detection.
- **End-to-end (fake agent):** a full release; a sync that proposes ideas; axe.
- **Integration:** actual temporary git repositories with checkpoint failures before/after commit, tag and member updates, repeat release/sync recovery, matching versus conflicting tags, changed approval and concurrent outside edits.
- **Real-agent checks:** P12-08 follows the root procedure and coverage matrix, locally and outside CI.

## Failure and recovery

- An existing tag for the journaled release commit is reconciled as an already-completed step. A same-named tag for another commit stops the release with a clear message; never overwrite it.
- Sync never overwrites a confirmed answer. It proposes a Profile change action instead.

## Exit criteria

Every story is accepted, interruption/retry checks pass, and release/sync runs in both real agents are recorded.

## Hand-off

- Treat the sync record as a format change: update the spec page, schema and generated references in the same commit (P01's rules).
