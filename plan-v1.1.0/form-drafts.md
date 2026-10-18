# Form drafts — cross-cutting v1.1.0 contract

[Tracker](main.md) · [P04 foundation and adoption](phase-04-task-forms.md) · [Vision](../VISION.md#17-v110-product-direction)

## Confirmed behavior

The user requested that **any form exited saves as a draft by default**, and confirmed **one badge per unfinished draft in a navigation bar at the top** when the form is reopened. Label each badge with the draft title or a short text excerpt; selecting it restores the whole form (C07). Drafts stay private on this computer and survive app restarts and project reopening (C08). This covers unfinished forms throughout the app, including task creation/editing, profile/project setup, Team, question answers, rejection/review feedback, AI drafts and release preparation. Saving a draft preserves input; it does not submit a ticket, answer a question, approve a plan, apply settings or finalize a release.

C06 additionally requires generated task metadata to remain a draft for review until the user explicitly saves. C09 requires every fresh task/backlog form to open in **Agentic**, even if the last-used mode was Normal; restoring a draft keeps its own saved mode. U08–U10 are resolved. The lifecycle implementation details below remain proposals within those confirmed product choices.

## Proposed lifecycle

- Assign a stable draft ID and form kind, with project identity, source record/field and original revision where applicable. Separate projects, create/edit forms and targets; never restore one ticket's feedback onto another. Keep independent unfinished forms available rather than overwriting them with unrelated input.
- Persist changes incrementally; flush on normal close, Escape, backdrop dismissal, Cancel, route change, project switch and window/app close. Do not rely solely on an asynchronous unload handler. Draft switching also saves the form being left. An untouched empty form need not create an empty badge.
- Preserve entered Markdown bytes, mode, title, description, assignee, release, selected options, incomplete/invalid field values and completed generated metadata. Draft persistence must not require canonical-record validation. Store enough step/review state to resume the form, without replaying any submitted operation or pending network request.
- On reopening, place the keyboard-accessible draft badge navigation at the top, above form fields, with one badge per unfinished draft (C07). Labels use an existing title or short source-text excerpt, plus accessible context when labels collide. A restored draft retains its saved values/mode, rather than replacing them with current Me/release defaults. User selection restores the whole form; a clear New draft control begins fresh capture in Agentic mode (C09), independent of prior mode use.
- Normal exit preserves a draft without a discard prompt. Provide a distinct explicit discard action. Remove a draft only after its submit/save is acknowledged as durable; a failed save, duplicate click, interruption or lost service keeps it recoverable. Do not retain a successfully submitted draft as another pending ticket.
- Restoring a draft never refreshes its source revision silently. If its original ticket, question, profile block or release proposal changed, surface the stale context before submission and use existing conflict/review renewal rules. Already answered/removed targets remain recoverable text, not actionable approvals.
- Keep saved drafts private on this computer after restart and project reopening (C08). Durable draft tables/files must survive disposable-index rebuilds and remain separate from canonical planning undo. Serialize writes per draft, detect competing windows and prevent older autosaves overwriting newer values. Report persistence failure; do not silently close a form while claiming a save succeeded.
- Any future secrets must use an encrypted credential boundary and never appear in badge labels, logs, ordinary draft blobs or AI context. If encrypted draft persistence is unavailable, explain that exceptional field's state and keep the form open for recovery. This is part of making the all-forms requirement concrete, not permission to store credential text in plain app data.

Search/filter controls and instantly applied settings are already view state or persisted settings, rather than unfinished submission forms. Inventory each actual form and document its draft adapter; do not use this distinction to omit data-entry forms.

## Implementation ownership

P04 delivers the reusable persistence/bridge/UI contract and retrofits every form already present after P01–P03, including Team/profile/settings entry forms. Split foundation and adoption into separate demonstrable stories: each includes a working form, persistence, badges and tests. P07 adopts it for bottom-panel questions/feedback; P09 for the release wizard. Later forms must use it by default. P10 audits the whole inventory and proves no unfinished data-entry form loses input on exit.

Draft values are private durable app data, excluded from Git and shared planning records (C08). Use explicit AI feature/context selection before including any draft text in a headless AI request; saving or restoring a draft alone sends nothing. Table/file layout remains an implementation choice, but disposable index reconstruction must never erase drafts. No repository-shared draft format or cross-device synchronization is part of this release.

## Acceptance and recovery coverage

Test each exit route plus one badge per draft, whole-form restoration, badge/draft switching, multiple unfinished records, invalid partial values, explicit discard, successful/failed submission, missing-agent AI errors and late AI responses. Prove a fresh form starts in Agentic after the user previously chose Normal, while restoring a Normal draft keeps Normal. Verify private app-data storage, no draft Git changes, restart, project switch, concurrent windows, storage failure, versioned draft-schema upgrade, cache rebuild and stale record/gate restoration. Resume a release draft without creating commits/tags or reusing stale approval; resume a question without sending an answer. Test both themes and keyboard/screen-reader navigation. Keep evidence as actual phase verification, not a claim that this contract has run.

## Source form inventory — implementation audit

All rows have adapters accepted under P04 on 2026-10-15. The [evidence](../docs/verification/v1.1.0-p04.md) records executed checks; P10 repeats the release-wide audit. P07/P09 retain these adapters as the UI moves.

| Form family | Source | Values/context to retain | Owner |
| --- | --- | --- | --- |
| Task creation / Backlog / promotion | `task-capture.tsx`, `project-backlog.tsx` | Mode, source prompt, title, description, type, assignment, release, idea status/reason, generated result, original promoted idea revision | P04 |
| Action description / relationships | `action-editor.tsx` | Action ID, original revision, description, parent and blockers | P04 |
| Review rejection | `action-editor.tsx` | Action/review context and revision, feedback | P04/P07 |
| Profile setup | `project-profile.tsx` | Project name, template/version, every partial answer, inference/confirmation choices | P04 |
| Profile answer edit | `project-profile.tsx` | Block/answer ID, original block revision, partial value and status | P04 |
| Release source (Releases page) | `project-release-source.tsx` | Partial package/folder path, selection mode and original metadata revision | P04; monorepo follow-up |
| Team member entry | `team-settings.tsx` | Partial name/email or identity; selected edit target and original roster context | P04 |
| AI preferences (2026-10-16 follow-up) | `ai-settings.tsx` | Per-client model and effort; restoring never applies settings | P04 boundary, updated in v1.2 follow-up |
| AI request/review | `ai-suggestion.tsx` | Original intent/context, notes, generated result and edited fields; no pending request replay | P04 |
| Profile follow-up prompts | `profile-ai.tsx` | Editable generated questions and originating profile answer | P04 |
| Planning commit | `planning-commit.tsx` | Selected paths, message, exact preview revision and operation identity; no commit on restore | P04 |
| Question answer | `action-gates.tsx` | Action/question/round, original revision, selected options, delegation/free-text state and text | P04/P07 |
| Plan change request | `action-gates.tsx` | Action and original plan revision, feedback | P04/P07 |
| Release preparation | `project-releases.tsx` | Member IDs/hashes, wizard step, original package path/version/hash, bump/custom input, Markdown notes, exact Done subset and keep/move decision | P04/P09 |

Search/filter controls are view state. Theme/client/Me/membership/model preferences and checklist/queue actions apply immediately and retain their existing persistence/error handling. Pure confirmations, fixed recovery commands, read-only viewers and the OS folder chooser contain no unfinished app data-entry values; they do not create empty draft badges. This distinction does not exempt the actual entry/review forms above.


Settings' `draft-recovery.tsx` provides read-only text recovery and explicit discard for ordinary drafts whose targets no longer exist. It never applies their original operations. The form controllers observe private deletion events and keep any active input in a new local session. The removed OpenRouter credential form/drafts are retired by the v1.2 follow-up; no credential input remains.

P07 mounts the existing answer/feedback adapters inside the retained Waiting panel. Its toggle/splitter/nav exits flush through the same draft boundary; failures leave the pane visible. Reopening keeps the originating selection, and restart restores through top badges with original revisions. Panel widths/height, visibility, attention hashes and document search remain immediately persisted preferences/view state, not unfinished submission forms.
