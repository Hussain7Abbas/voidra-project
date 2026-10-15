# V11-P09 — Xeploy-guided releases and ticket versions

> **Needs:** P05, P07 · **Status:** Not started

## Outcome

Release preparation shows Xeploy-backed version choices and explicitly asks how current Done tickets should be versioned before finalization.

## Requirements

In scope: installed Xeploy integration, structured UI questions, version/notes/member preview, Done-ticket keep/move choice, exact acceptance and interruption recovery. Out of scope: unreviewed source writes by the desktop, Xeploy's direct publish/merge shortcut or replacing the checked immutable publication pipeline.

## Blueprint

Xeploy 1.4.2 is already pinned in the release engine. Reuse its current version calculation through a narrow adapter and verify its installed/public question/API surface before implementation. Display applicable prompts as typed UI choices with explicit values, validation, back/cancel and a resulting stable version; do not pipe an opaque interactive terminal into the renderer or invent undocumented Xeploy prompts. Extend the packaged dependency boundary if needed; verify it works offline in the actual app archive. Generic project preparation must not accidentally invoke this repository's own publishing workflow.

Read the chosen tracked-project version source from P01. Present the precise current/proposed versions and included completed work. Before final approval, require one choice: **Keep Done tickets at X.Y.Z (current release)** or **Move these Done tickets to A.B.C (new release)**. Bind the affected Done-ticket IDs and hashes to the displayed choice. Default proposed scope is current-version Done tickets explicitly shown in the preview; never retag previously published history or other releases. Retaining target metadata must not make released work eligible for duplicate publication.

Include the choice, target assignments, version source, release members/notes and exact version/tag in the Release proposal and review fingerprint. Changing any requires fresh acceptance. The selected coding client performs approved version/commit/tag work through the standalone lifecycle; the app only writes permitted planning records. Target-ticket assignment and release bookkeeping need a durable grouped checkpoint reconciled with Git effects, preserving crash/retry behavior and source-bound publication. Do not globally change versions on every Done ticket after a release succeeds.

Use P04's shared [form-draft contract](form-drafts.md) throughout release preparation: preserve the current step, selections, notes and keep/move choice on exit, with top draft badges when reopened. Resume against the saved source/member revisions and revalidate before Save/acceptance. Restoring a draft must not create a canonical release action, approve a proposal, commit, tag or publish. Draft autosave is the sole permitted effect of cancelling unfinished preparation.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P09-01 | Xeploy UI adapter | 5 | P05 | Applicable release questions appear as UI choices and derive the same stable proposed version as Xeploy; exiting preserves only the unfinished form draft, with top badge navigation on reopen and no canonical release/Git effect; invalid/unsafe versions are refused. |
| V11-P09-02 | Explicit Done-ticket decision | 5 | 01, P07 | Before final approval, both version-labeled options show the exact affected tickets; Keep preserves target assignments and Move assigns the proposed version only to that set. |
| V11-P09-03 | Exact Release acceptance | 5 | 02 | Editing version, notes, members or keep/move selection invalidates earlier acceptance; the app creates no version-bump commit/tag. |
| V11-P09-04 | Finalization and retry | 8 | 03 | Approved standalone finalization and crash/retry yield one matching commit/tag/release, correct ticket metadata and refreshed current/previous dropdown options, without altering prior releases. |

## Tests

Real temporary repositories for patch/minor/major, selected manifest, keep/move, stale Done records, concurrent completion, cancellation and exact-review invalidation. Inject interruptions before/after grouped writes, commit and tag. Prove duplicate release prevention and immutable retry; actual both-client release scenarios verify changed skills. Test the packaged Xeploy import and selected-client guidance.

## Failure and recovery

No mutable release side effect until exact acceptance. External version/member changes require a new preview. Preserve matching commit/tag and original source on retry; conflicting tags stop. Provider note-generation failure preserves hand-written notes. Offline version planning does not imply publication access.

## Exit criteria

All stories, `make check`, Electron release flows, packaged dependency checks and affected real-agent scenarios pass with evidence. No public release is claimed without actual publication.

## Hand-off

Update release/format/AI guidance, generated skill runtime, package boundaries and user guide. P10 verifies the complete v1.1.0 candidate through the retained publication pipeline.
