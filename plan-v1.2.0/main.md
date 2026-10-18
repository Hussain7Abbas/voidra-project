# Agentic task workflow implementation

Requested and clarified 2026-10-16. This tracker covers new source changes; v1.1.1 and its completed evidence remain immutable. Continue within the user's implementation authorization; no public release is requested.

## Accepted behavior

- One Add task entry creates Backlog work. Columns: Backlog → Planning → TODO → In progress → Review → Done.
- Planning queues questions, edge-case discovery, exact plans and needed subtasks. TODO holds fully planned work without an execution request. In progress queues approved implementation. Review queues QA/security; passing checks complete automatically, failures return TODO and new questions return Planning, retaining history.
- Moving cards queues work; Go/Sync opens the selected coding app with the corresponding command copied. No headless agent is started by a drag (answer 1a).
- Documentation contains Explore, Glossary and Decisions tabs. Remove standalone Glossary, Decisions and Run navigation; Actions owns run operations/recovery.
- Outside changes appear in a light-yellow notification bar above workspace content. Panel boundaries end at a thin resize line with no spacer after it.
- Task detail offers deletion with concurrency/run guards, preserving history and relationships through reversible soft deletion.
- Existing exact plan approval, durable ownership, expected hashes, source containment, private drafts and unrelated project history remain protected. Automatic Done applies only to a new explicit QA/security result for workflow tasks; release publication keeps its separate exact Review.

## Implementation tracker

| Slice | Scope | Status |
| --- | --- | --- |
| 01 | Shell boundaries, Documentation tabs, one task entry, Sync notification | Done (2026-10-16) |
| 02 | Compatible six-column workflow, Planning/subtasks, phase-sensitive queue, deletion | Done (2026-10-16) |
| 03 | Owned QA/security reports, automatic completion/rework and full context | Done (2026-10-16) |
| 04 | Selected-client opening, Actions run/recovery, runtime/skill integration | Done (2026-10-16) |
| 05 | Boundary tests, real clients, Electron/accessibility and documentation | Done (2026-10-16) |

Verification is recorded only after execution. New durable workflow fields require a matching reader; align a development version without tagging/publishing. Preserve legacy project behavior until adopting the new task workflow through explicit task moves/creation.

All five slices are complete. [Verification](../docs/verification/task-workflow.md) records 491 passing quality tests, 104 unique desktop scenarios across full/focused runs, both actual clients, actual old-reader refusal and packaged-app checks. Version 1.2.0 remains a development version; no publication was requested.

## First-launch setup follow-up

User request 2026-10-16: show theme, coding-agent and selected complete-bundle setup before the unconfigured app opens its workspace. Persist choices immediately, validate completion in main, preserve existing acknowledged setup and retain safe install/retry/replacement review. Done (2026-10-16): [verification](../docs/verification/app-onboarding.md) records 492 passing quality tests, 12 passing desktop scenarios, both themes/agent installers, restart and safe retry, and panel resizing after setup completion. This follow-up changes no skill runtime or shared project format and requests no publication.

## Internal AI agent follow-up

User request 2026-10-16: replace OpenRouter for every internal AI command with the selected headless Claude Code/Codex CLI. Offer model and effort in Settings and onboarding, preserving separate choices per agent. Keep exact privacy previews, editable results, cancellation and manual workflows. Remove provider credentials and unfinished-key controls; migrate obsolete encrypted local data without unlocking it. This source follow-up does not change shared planning records, launch implementation on drag, or authorize publication. Done (2026-10-16): the complete quality gate passes 504 tests; final restricted-client checks pass 29 focused tests, and the complete desktop run passes 108 scenarios with two expected background skips. Both actual coding clients return valid suggestions. See [headless AI verification](../docs/verification/headless-ai.md).

## Monorepo release/navigation follow-up

User request 2026-10-18: discover `package.json` inside app/apps/packages and arbitrary subfolders, offer a native picker for the parent folder of subprojects, and use the highest numeric release found. Preserve existing exact package selections as an explicit mode. Move Release settings (including the release-aware tracking upgrade) from Tasks to Releases and put Profile last in the sidebar. The selected folder stays contained in the open project, persists through the existing guarded/undoable metadata write and remains live as package versions change. Source changes never retag existing tasks; competing package changes invalidate stale release proposals. Done (2026-10-18): [verification](../docs/verification/monorepo-releases.md) records 27 focused tests, the native creation regression, seven Electron scenarios in both themes and both actual coding clients. The full suite passed 509/512 before the existing creator-label mismatch was corrected and both workflow timeout cases passed focused reruns; a fresh complete coverage gate is not claimed. No publication is requested.

## Meta-repository runtime follow-up

User request 2026-10-18: support parent repositories with Git submodules after run startup tried to hash a dirty gitlink directory as a text file. Also remove the unavailable registry-version dependency from installed skill validation. Keep root planning ownership, enumerate initialized/nested child repositories, protect pre-existing edits/pointers, commit exact child paths before parent gitlinks and recover persisted commit intent without duplicate commits. Planning and QA remain read-only across child sources, HEADs and tags. No automatic submodule initialization, fetch or push. Bundle the exact matching check/recover CLI in all six skills and point new planning instructions to it. Done (2026-10-18): [meta-repository evidence](../docs/verification/meta-repos.md) records 525 passing quality tests, a final 10-test guard rerun, refreshed desktop skill payloads, Luna success and a successful Claude default-model retry after the small model mishandled process ownership. This source follow-up does not authorize publication.
