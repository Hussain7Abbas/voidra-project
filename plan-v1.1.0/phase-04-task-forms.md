# V11-P04 — Normal and Agentic task capture

> **Needs:** P02, P03 · **Status:** Done — 2026-10-15 · **Confirmed:** C06–C09, R18 · **Proposals:** A04, A08, A09

## Outcome

Users capture work through consistent Markdown forms, with optional titles, reviewed AI generation, a single-input Agentic mode and recoverable unfinished forms throughout the app.

## Requirements

In scope: create-action/feature and create-backlog entry points, their later Tasks equivalents, Normal/Agentic segmented modes, assignee dropdowns, OpenRouter generation, removal of Who does the work and a shared draft mechanism for all data-entry forms. Include edit flows and shortcuts that create the same records. Out of scope: AI implementation, automatic plan acceptance or remote source-code context.

## Blueprint

Normal displays optional **Title** and the shared Markdown **Description**. A blank/whitespace title normalizes to null and requests an OpenRouter-generated title from the user's text. An explicitly supplied title is preserved. Action type uses the existing valid type choices in Normal; Feature is included in every optional-title check.

Agentic displays one Markdown content input instead of separate Title/Description/Action Type fields. Generate and validate hidden title, description and type against the same shared contract before saving. Preserve the original prompt for the draft; do not expose a second required content field. Assignee remains a common metadata dropdown backed by Team, preselected from Me. Preserve the mode's draft when switching and do not overwrite an explicitly edited value with an arriving response.

Every fresh task/backlog form starts in Agentic mode (C09), including after the last form used Normal. Restoring an existing draft uses that draft's mode; opening a saved Normal draft must not reset it to Agentic.

Reuse main-only OpenRouter credentials, selected model, exact request privacy previews, cancellation and output validation. Generation runs from a deliberate submission/generate action, not each keystroke. Bind results to the originating draft revision. C06 requires a concrete generated summary for review and an explicit Save before canonical ticket creation; persisting the unfinished form is independent. Hidden fields need not become editable inputs. No key/network/credits means the draft stays intact with retry/setup or Normal manual entry. Optional title input does not require storing an invalid blank title.

Implement the shared [form-draft contract](form-drafts.md). Incremental persistence plus a normal-exit flush protects input across close/Escape/backdrop/Cancel, navigation, project switch and app restart. Reopening places a keyboard-accessible navigation bar above the fields with one badge per unfinished draft, labeled by title or short excerpt; selecting a badge restores its whole form (C07). Drafts are private durable local app data, never repository-shared records (C08). Preserve invalid partial values, source hashes, Markdown, assignee/release, input mode and generated results. Restoring never submits an answer, applies settings or renews approval. An explicit discard is separate from normal exit; remove a draft only after acknowledged successful submission. Keep encrypted credentials outside ordinary blobs/labels and draft durability outside rebuildable cache state.

Adopt the mechanism in all forms already present after P01–P03: task/create/edit, project/profile, Team/member, settings entry and AI-related forms. P07 and P09 adopt it in their changed human-gate and release forms. Keep a form inventory so the all-forms requirement is testable rather than an informal convention.

Remove the work-performer selector from all form variants. New ordinary work defaults to agent execution internally; preserve legacy human tasks and agent-created human blockers/checklists without a destructive migration.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P04-01 | Normal capture | 5 | P02, P03 | Action, Feature and Backlog forms expose Title/Markdown Description, omit Who does the work, and preselect Me in the assignee dropdown. |
| V11-P04-02 | Null-title generation | 5 | 01 | An empty title generates via OpenRouter; a manual title survives; no key/error/cancel preserves the draft and enables manual completion. |
| V11-P04-03 | Agentic capture | 8 | 02 | One Markdown input generates a validated title/type/description; review and save produce the expected record and current release; invalid output creates nothing. |
| V11-P04-04 | Mode/edit consistency | 3 | 03 | Fresh forms always start Agentic regardless of last-used mode; restored drafts retain their saved mode; switching modes retains text/assignment; late generation cannot overwrite a newer draft; legacy human checklists remain usable. |
| V11-P04-05 | Durable drafts and top navigation | 8 | 01, 04 | Exiting an unfinished task form through every supported route preserves even invalid partial input privately on this computer; reopening/restarting shows one top badge per draft and selecting it restores the whole form without creating a ticket; cache rebuild does not erase drafts and no draft enters Git. |
| V11-P04-06 | All-form adoption and stale recovery | 8 | 05 | Every existing data-entry form uses the shared draft lifecycle; switching drafts preserves input; successful submit clears only its draft; failures keep it; stale-source restoration cannot bypass conflicts/approvals and credentials never appear in labels/plain draft blobs. |

## Tests

Public AI prompt/output schemas, captured request privacy boundary, stale/cancelled requests, missing type/title and response limits. Electron workflows for every creation entry point, both modes, optional title and project-specific Team membership; test source reveal, submission undo, external edits and provider errors with local HTTP fixtures. For every form adapter, cover normal exits, badge navigation, invalid values, restart/project switch, explicit discard, successful/failed save, concurrent windows, persistence errors, draft-schema upgrade, cache rebuild and stale source/gate context. Test protected credential handling through temporary encrypted-store fixtures.

## Failure and recovery

Generation is draft-only until save. No partial ticket is persisted on AI failure; no user text is lost. Saving remains atomic and revision guarded. Missing current release follows P01's explicit resolution path; Backlog may remain unversioned. A draft-write failure is visible and must not silently close the form as though saved. Restore drafts against their original revisions; never overwrite newer records or replay in-flight AI/submission effects.

## Exit criteria

All creation paths implement C06–C09 and every existing data-entry form is inventoried/adopted under R18. Both clarification rounds are resolved; U01 was discarded by the user and adds no requirement. All stories and `make check` pass with recorded evidence.

## Hand-off

Update form, draft durability, AI/privacy and legacy-human behavior docs. P05 embeds these creators into Tasks; remove redundant entry points only once the new paths work. P07/P09 reuse the draft API and badge navigation; later forms opt in by default, with P10 auditing the inventory.

## Implementation sequence within this phase

The first Normal capture slice introduces the reusable private draft store/session with that working form, avoiding a second incompatible form-state implementation. Full generation/mode/durability and all-form acceptance remain the explicit later stories; implementing the foundation early does not mark those acceptance checks complete. Keep original revisions and typed invalid partial values throughout.

## Executed acceptance

All six stories are complete. [P04 evidence](../docs/verification/v1.1.0-p04.md) records final 451-test quality acceptance and the broad/focused desktop runs, including actual storage failure, process death, encrypted credentials, restart, stale source and Markdown cursor reuse. M11-1 is reached; P05 follows.
