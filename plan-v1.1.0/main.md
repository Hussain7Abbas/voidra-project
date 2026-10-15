# Voidra Project — v1.1.0 implementation plan

> Requested 2026-10-15. **V11-P01 complete on 2026-10-15**, implemented under the user's “start implementing”. V11-P02–P04 are complete; remaining phases continue under the user’s explicit “complete all phases non-stop” authorization. The product direction comes from the user's request; technical choices below are proposals unless identified as existing behavior. Verification applies only to completed phases with linked evidence; no release has been published.
> **Clarifications:** the user answered round 1 with `1a, 2a, 3a, 4a, 5c, 6a` and round 2 with `7a, 8a, 9b`. Automatic private form drafts, one badge per draft and Agentic defaults are confirmed. Both question rounds are resolved.

[Vision](../VISION.md#17-v110-product-direction) · [Plan rules](AGENTS.md) · [Completed v1 plan](../plan/main.md) · [Documentation](../docs/intro.md)

## Release outcome

Voidra becomes an agentic coding workspace centered on **Tasks**: a Kanban board for tickets, a right **Actions** sidebar for the implementation sequence, and a bottom **Waiting for you** panel for answers and approvals. Navigation, Actions and Waiting for you can each be toggled and resized. Markdown is rendered consistently, with editing in place wherever the user is allowed to edit.

The existing filesystem source of truth, standalone skills, exact plan/review gates, persistent undo and safe release recovery remain the foundation. This release does not add the separately designed v2 agent launcher, parallel worktrees or a dashboard.

## Current baseline and affected seams

| Existing source | What the plan changes |
| --- | --- |
| [Desktop shell](../apps/desktop/src/renderer/app.tsx), [titlebar](../apps/desktop/src/renderer/window-titlebar.tsx), [history controls](../apps/desktop/src/renderer/edit-history.tsx) | Replace separate Backlog/Actions navigation; remove workspace topbar; move history/toggles into titlebar. |
| [Backlog forms](../apps/desktop/src/renderer/project-backlog.tsx), [action forms/board](../apps/desktop/src/renderer/project-actions.tsx) | One Tasks experience, Normal/Agentic creation, optional input titles, team assignments and card movement. |
| [Markdown renderer](../apps/desktop/src/renderer/markdown.tsx) | Safe shared rendering plus a source-preserving editor with cursor/selection reveal. |
| [Settings tabs](../apps/desktop/src/renderer/settings-tabs.tsx), [app preferences](../apps/desktop/src/main/state.ts), [installer](../apps/desktop/src/main/skill-installer.ts) | Team tab, Me, default client, two complete-bundle install actions. |
| [Shared planning API](../packages/voidra/src/planning.ts), [queue](../packages/voidra/src/queue.ts), [runtime](../tools/run-engine/src/run.ts) | Compatible ticket metadata, board transitions and ordered intent without bypassing execution eligibility. |
| [Knowledge view](../apps/desktop/src/renderer/project-knowledge.tsx), [document viewer](../apps/desktop/src/renderer/document-viewer.tsx), [knowledge service](../apps/desktop/src/project-service/knowledge.ts) | Markdown decisions/glossary and a full Documentation page with directory search/highlights. |
| [Release screen](../apps/desktop/src/renderer/project-releases.tsx), [Xeploy adapter](../tools/release-engine/src/bump.ts) | Guided release choices and explicit Done-ticket version retention/reassignment. |
| [Bridge](../apps/desktop/src/shared/bridge.ts), [workspace edits](../apps/desktop/src/project-service/workspace.ts), [undo](../apps/desktop/src/project-service/undo.ts) | Validate every new command, classify mutations and retain concurrency/recovery guarantees. |

Xeploy **1.4.2 is already declared** in [release-engine/package.json](../tools/release-engine/package.json). Its existing adapter calculates stable bumps. The desktop question flow and generic tracked-project integration still need implementation; do not present this as an already implemented UI.

Version distinction: the workspace root manifest is `0.0.0`; the shipped desktop manifest is `apps/desktop/package.json` at `1.0.0` when this plan was written. A tracked project's ticket release must come from that project's chosen package manifest, not blindly from Voidra's own app version or a monorepo root sentinel.

## Phase tracker

Status values: **Not started**, **In progress**, **Blocked** with reason, **Done** with date. Evidence is added only after execution.

| Phase | Outcome | Needs | Status | Evidence |
| --- | --- | --- | --- | --- |
| [V11-P01](phase-01-task-contracts.md) | Compatible task/release contracts and a first Tasks view | Completed v1 baseline | Done — 2026-10-15 | [Verification](../docs/verification/v1.1.0-p01.md) |
| [V11-P02](phase-02-markdown-editing.md) | Shared rendered Markdown with active-line/selection source editing | P01 | Done — 2026-10-15 | [Verification](../docs/verification/v1.1.0-p02.md) |
| [V11-P03](phase-03-team-agent-settings.md) | Team, Me, default client and full-bundle skill installation | P01 | Done — 2026-10-15 | [Verification](../docs/verification/v1.1.0-p03.md) |
| [V11-P04](phase-04-task-forms.md) | Normal/Agentic capture, reviewed AI output and durable drafts with top badge navigation across forms | P02, P03 | Done — 2026-10-15 | [Verification](../docs/verification/v1.1.0-p04.md) |
| [V11-P05](phase-05-kanban.md) | Tasks Kanban, drag/drop and release filtering | P04 | Not started | — |
| [V11-P06](phase-06-actions-sequence.md) | Actions sidebar, TODO enrollment and dependency rearrangement | P05 | Not started | — |
| [V11-P07](phase-07-workspace-panels.md) | Resizable/toggleable panels, bottom human gates and titlebar controls | P02, P06 | Not started | — |
| [V11-P08](phase-08-knowledge-documentation.md) | Markdown knowledge pages and searchable documentation tree | P02, P07 | Not started | — |
| [V11-P09](phase-09-release-flow.md) | Xeploy UI questions and recoverable Done-ticket release choice | P05, P07 | Not started | — |
| [V11-P10](phase-10-verification-release.md) | Full compatibility, real-agent, accessibility and release evidence | P08, P09 | Not started | — |

Use full IDs when referring to phases to avoid confusion with the completed v1 P01–P17. Run the first eligible phase after its understanding check and applicable approval. Existing D24 delegation concerns the original v1 plan; it is not blanket v1.1.0 implementation approval.

## Milestones

| Milestone | Phases complete | Demonstrable result |
| --- | --- | --- |
| M11-1 — Capture | P01–P04 | Create assigned tasks with Normal or Agentic Markdown input and a project release; exit/reopen unfinished forms through saved draft badges. |
| M11-2 — Coordinate | P05–P07 | Move cards, order implementation, answer gates and resize/toggle workspace panels. |
| M11-3 — Ship | P08–P10 | Search project knowledge and release with verified version choices and compatibility. |

## Decision register

### User requirements — 2026-10-15

| ID | Accepted direction | Delivery |
| --- | --- | --- |
| R01 | Titles are optional inputs for action/feature creation; a null/empty title is generated using OpenRouter. | P04 |
| R02 | “WAYSWING” means rendered Markdown in the input; the cursor's line reveals its Markdown source, and a multiline selection reveals the selected lines. Use this by default throughout Markdown forms. | P02, P04, P07, P08 |
| R03 | Create-action and create-backlog entry points have **Agentic / Normal** segmented input modes. Normal shows Title and Description; Agentic shows one Markdown input and derives hidden fields including Title and Action Type. | P04 |
| R04 | Assignee is a dropdown populated from Settings → Team; members can be added and one member marked **Me** to preselect forms. | P03, P04 |
| R05 | Settings offers **Claude Code / Codex** as the default coding AI client. Operational agent choices show only the selected client. | P03 |
| R06 | Remove **Who does the work** from forms. | P04 |
| R07 | Replace Backlog and Actions pages with a **Tasks** Kanban board and draggable cards. **Actions** becomes a toggleable right implementation-sequence sidebar; entering TODO enrolls a ticket by default. | P05, P06 |
| R08 | The sequence is draggable. Dependency order problems display a warning with **Rearrange**; doing nothing may leave the warning/order in place. | P06 |
| R09 | **Waiting for you** becomes a toggleable bottom panel that opens when an answer is needed, with Markdown questions. All sidebars and the bottom panel are resizable. | P07 |
| R10 | New tickets default to the project's current package release. Backlog may have a null release; every other status requires one. Drag/drop assigns the current release when a destination needs a missing release. Tasks has a current/previous-release dropdown. | P01, P05 |
| R11 | Use installed Xeploy for release version planning and show its relevant questions as UI choices. Before release, explicitly choose whether current Done tickets retain the current version or move to the proposed version. | P09 |
| R12 | Undo/Redo move to the titlebar. Remove **Local project** and the workspace topbar. | P07 |
| R13 | General's skill controls are exactly **Install Claude skills** and **Install Codex skills**, without individual skill selection. | P03 |
| R14 | Decisions cards and Glossary support rendered Markdown consistently. | P08 |
| R15 | Documentation is a page with a directory tree and its own global document search. Search filters files with match counts; opening a match highlights search text in the page. | P08 |
| R16 | Deliver a phased implementation directory with `main.md`; the product is an agentic coding framework with Kanban tracking. | This plan, all phases |
| R17 | Ignore the unfinished sentence ending in `~`; it adds no requirement. The user selected option b in the clarification on 2026-10-15. | U01 resolved |
| R18 | Exiting any form saves its unfinished values as a private local draft by default. Reopening shows one badge per unfinished draft in a navigation bar at the top; selecting a badge restores that whole form. Applies across the app, not only task creation. | P04 foundation/adoption, P07 gates, P09 releases, P10 audit; [draft contract](form-drafts.md) |

### Confirmed clarification answers — 2026-10-15

| ID | User answer | Settled behavior | Delivery |
| --- | --- | --- | --- |
| C01 | 1a; U04 resolved | One task is one executable action; larger work splits into linked child tasks. | P01, P05, P06 |
| C02 | 2a; U05 resolved | Columns are Backlog → TODO → In progress → Review → Done; detailed lifecycle stages appear within cards/details. | P01, P05 |
| C03 | 3a; U02 resolved | Preserve an existing target release when dragging; fill the current version only when a required release is missing on leaving Backlog. | P01, P05 |
| C04 | 4a; U03 resolved | Use root package.json by default with a per-project alternate package selection. If no usable version exists, retain Backlog capture and hold required-release moves until resolved. | P01 |
| C05 | 5c; U06 resolved | One local Team roster; each project chooses its members. Me is personal. | P03, P04 |
| C06 | 6a; U07 resolved | AI generates a draft; the user reviews it and explicitly saves the ticket. | P04 |
| C07 | 7a; U08 resolved | One badge per unfinished draft, labeled with its title or a short excerpt; selecting it restores the whole form. | P04, P07, P09 |
| C08 | 8a; U09 resolved | Drafts stay private on this computer and survive app restarts and project reopening; they are not shared through the repository. | P04, P07, P09, P10 |
| C09 | 9b; U10 resolved | Every fresh task/backlog form opens in Agentic mode, regardless of last-used mode. Restored drafts retain their saved mode, including Normal. | P04 |

### Proposed implementation rules

| ID | Proposal and rationale | Revisit before |
| --- | --- | --- |
| A01 | C01 settles one task per action. Proposed record strategy: preserve existing idea/action IDs and reciprocal promotion links behind the unified view; no duplicate source of truth or wholesale folder rename. | P01 |
| A02 | C02 settles the five board columns. Proposed presentation for cancelled/rejected work is a filter; Backlog/TODO organization never bypasses lifecycle gates. | P01/P05 |
| A03 | Keep ordered intent separately from runnable eligibility. Blocked TODO tasks may appear in Actions, while both standalone clients still refuse blocked execution. The adapter must preserve consumption/recovery and private-queue compatibility. | P06 |
| A04 | Clearing a title requests generation; persistence may still require a resolved nonempty title. Without usable AI, preserve the draft and offer key setup/retry or manual title/type. No fabricated generation or source-code upload. | P04 |
| A05 | “Always Markdown” changes rendering, not write permissions. Glossary, repository docs, accepted decisions and exact approved plans remain read-only unless their existing workflow explicitly permits editing. | P02/P08 |
| A06 | Default client hides alternate operational command choices; the two explicitly requested installer buttons remain visible in General. It does not uninstall the other client or cancel its active process. C05 settles local roster with per-project membership; portable assignments remain shared record values. | P03 |
| A07 | C03 settles preservation of existing release assignments. Proposed model: target-version metadata is separate from historical release membership/commit/tag. Backlog defaults to current release but can be explicitly cleared. | P01/P05/P09 |
| A08 | Preserve legacy human actions/checklists and agent-created human blockers. New general task forms default to agent work and omit the removed selector. | P04 |
| A09 | C07/C08 settle per-draft badges and private durable storage. Proposed implementation uses one shared mechanism preserving invalid partial values/source revisions, incremental autosave and a normal-exit flush; discard is an explicit action. | P04 and later adopters |
| A10 | Implementation decision: align the local app/library/reader/all skills to the 1.1.0 development candidate during P01-03, before writing metadata requiring reader 1.1.0. Keeping the reader at 1.0.0 would make it refuse its own safe migration; using a 1.0.0 minimum would let older clients ignore new invariants. Reuse the alignment helper and regenerate bundles. P10 still owns final candidate acceptance/publication; this creates no tag or remote release. | P01-03; reverify alignment in P10 |

These technical proposals can be resolved during the relevant phase understanding check. C01–C09 and R18 are user decisions, not proposals.

### Unresolved requirements

None from the two clarification rounds. U01 was discarded; U02–U10 are resolved in C01–C09. Remaining technical proposals are identified above and can be settled within the confirmed scope during phase planning. Ask further product questions only if new evidence exposes a material ambiguity.

### Clarification round 1 — 2026-10-15

The user answered all six questions with `1a, 2a, 3a, 4a, 5c, 6a` on 2026-10-15. The options below preserve the asked questions; the chosen behavior is authoritative in C01–C06. Recommendations in the historical options are not additional decisions.

| Chat question | Decision | Choices and tradeoffs |
| --- | --- | --- |
| 1. What does one task card represent? | U04 | a (recommended): one executable action, split large work into linked child tasks; b: a task contains multiple actions that appear separately in the Actions sidebar. |
| 2. Which board columns should be shown? | U05 | a (recommended): Backlog / TODO / In progress / Review / Done, with detailed agent stages inside the card; b: Backlog / TODO / Discovery / Plan / Implement / Verify / Review / Done. Custom columns are welcome in free text. |
| 3. What happens to an existing release assignment when moving a card? | U02 | a (recommended): keep it and fill only a missing release when leaving Backlog; b: assign the current release on every move into a non-Backlog column. Historical published-release records remain immutable in both cases. |
| 4. Which package supplies the project's current release? | U03 | a (recommended): use root package.json by default and allow a different package.json per project, with explicit selection when no usable default exists; b: always require a package.json selection during setup. Missing manifests/versions retain Backlog capture and block moves requiring a release until resolved. |
| 5. Where should Team members be available? | U06 | a: a project-specific roster shared through the repository; b: one local roster across all projects; c (recommended): one local roster with each project choosing its members. Me remains a personal selection, never a shared identity override. |
| 6. How should AI-assisted creation finish? | U07 | a (recommended): generate a draft, review the result, then Save; b: one Create action generates and saves valid fields, with editing afterward. Errors preserve the original input in both cases; AI never approves a plan or executes work. |

### Clarification round 2 — form drafts and input defaults

The user answered `7a, 8a, 9b` on 2026-10-15, recorded as C07–C09. The table preserves the original options; the selected answers, not historical recommendations, are authoritative. Exiting any unfinished form saves its draft.

| Chat question | Decision | Choices and tradeoffs |
| --- | --- | --- |
| 7. What should the top badges represent? | U08 | a (recommended): one badge per unfinished draft, labeled with its title or a short text excerpt; selecting it restores the whole form; b: one badge per field value within the latest draft, selecting a badge jumps to that field. |
| 8. Where should drafts persist? | U09 | a (recommended): privately on this computer, surviving app restarts and project reopening; b: in the project repository so drafts can be shared across machines/teammates. |
| 9. Which input mode should a new form use? | U10 | a (recommended): remember the last-used mode, with Agentic for first use; b: always Agentic; c: always Normal. Restored drafts keep their saved mode in every case. |

## Requirement coverage and validation

Every requirement maps to phases above. Phase files specify observable acceptance checks; executed results belong in the linked evidence, and unstarted phases have no verification claim. Shared format/transition/queue tests belong in `packages/voidra/tests/`; native/bridge/service tests in `apps/desktop/tests/`; desktop/accessibility workflows in `apps/desktop/e2e/`; standalone behavior in `tools/run-engine/tests/`; publication recovery in `tools/release-engine/tests/`.

Run `make check` after each implemented story, with quality and Electron suites sequentially under existing instructions. Use real temporary files, Git and native services; mock external AI/network only. Exercise fresh and migrated projects, light/dark themes, keyboard-only drag/reorder/resize alternatives, content selection, IME, external edits, undo/redo, crash/restart and stale approval refusal. Keep tag-only CI triggers unchanged.

P10 repeats affected standalone scenarios with **both** actual coding clients under the repository's real-agent procedure, despite showing just the user's chosen client in normal app operation. Existing v1 evidence is a baseline, not proof of v1.1.0 behavior. Preserve the current coverage targets and packaging/recovery gates.

## Ready, done and hand-off

A phase is ready when prerequisites are Done, its material unknowns have been resolved and its understanding check has been accepted under the root workflow. Every story must cross enough layers to demonstrate its behavior; split a story rather than introduce a data-only or test-only implementation phase.

A phase is Done only after all acceptance criteria pass, relevant docs/instructions/references are current, actual evidence is recorded and the root commit/push workflow is complete. Release publication additionally requires the checked pipeline and actual access. Writing this plan did not modify packages or planning actions. P01's implementation aligns the app/library/reader/skills to the 1.1.0 development candidate (A10) to enforce the new minimum-reader contract; this does not publish, alter this repository's `.voidra/` actions or reopen finished v1 phases.

**V11-P01–P04 are complete**, including Normal/Agentic reviewed capture and private durable drafts across existing forms. M11-1 is reached. All clarification questions U01–U10 are resolved by R17/C01–C09. V11-P05 is next; P05–P10 have not started.

## Continuing authorization — 2026-10-15

The user explicitly requested “complete all phases non-stop”. Continue P02–P10 without another phase go-ahead, resolving routine technical choices within the confirmed requirements. Report each phase understanding and real checks. Preserve named product/account gates and never claim unperformed verification or publication.

## P03 implementation choices

Codex is the explicit initial coding-client preference for fresh and legacy settings; changing it is immediate for subsequent commands. Team uses stable local IDs and unique email identities, preserving `Name <email>` assignments on shared tickets. Adding a member while a project is open includes them in that project; other projects choose their subsets. Me only preselects within that subset. These are implementation choices under the continuing authorization, not additional user answers.

## P04 implementation choices

Each capture mode retains its own reviewed generation. Agentic results seed untouched Normal fields for editing; explicit Normal edits survive switches. Drafts use main-owned atomic private files outside Git, undo and rebuildable indexes, with a separate encrypted credential boundary. Original source/model context remains bound across restoration. Settings closes after its own form scopes flush, while navigation and window closure flush all mounted forms. Canonical creation retries use durable private submission receipts; a restore never replays an operation. Cursor movement within unchanged revealed Markdown lines reuses formatting to avoid unnecessary full-document parsing.
