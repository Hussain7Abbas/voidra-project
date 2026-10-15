# V11-P10 — Compatibility, accessibility and v1.1.0 delivery

> **Needs:** P08, P09 · **Status:** In progress

## Outcome

The complete agentic Tasks workspace is verified against old/new projects, both coding clients and the actual packaged app before v1.1.0 delivery.

## Requirements

In scope: cross-phase regressions, real-agent compatibility, migration/recovery, documentation and candidate distribution verification. Out of scope: implementing unrelated v2 features, claiming historical tests prove current behavior, weakening coverage or moving published tags.

## Blueprint

Retain the v1 release matrix and add the changed user journeys: Normal/Agentic intake → optional-title generation → team assignment → TODO/drop with release → Actions order/warning/Rearrange → selected-client run → automatic bottom questions → exact plan/review → Done → keep/move release choice. Include an ignored warning to prove no blocked implementation occurs.

Audit Markdown on descriptions, question/option/answer prose, feedback, plan/review bodies, AI drafts, decisions, glossary and documentation. Verify allowed edit surfaces reveal cursor/selection source and read-only surfaces remain rendered. Check titlebar-off mode, every panel's pointer/keyboard resizing/toggling, native menus, local editing undo and persisted workspace undo across restart/consumption.

Audit the complete [form inventory and draft contract](form-drafts.md): every unfinished data-entry form survives every normal exit and reopens with its top badge navigation. Include task/create/edit, setup/profile, Team/settings entry, AI, answers/feedback and release forms. Verify invalid partial values, multiple sources, restart/project switch, explicit discard, acknowledged submit cleanup, cache rebuild and stale gate/source restoration; saving/restoring a draft must not submit, approve or perform release effects.

Run quality and Electron suites sequentially. Test genuine temporary repositories and both actual coding clients locally using root model/effort/retry rules, including the newly packed matching CLI, allowed write paths and gate stops. The UI preference does not remove the both-agent support contract. Record small-model limitations honestly; fake-agent fixtures prove only app behavior.

P01-03 prepares the aligned local 1.1.0 development identity so its reader can enforce the new minimum (A10). Here, verify final alignment and prepare accepted candidate artifacts, skill copies and compatibility references after implementation checks. Use the retained checked publication/recovery workflow; keep source-bound artifact bytes immutable. Publication is a separate actual checkpoint, not a consequence of writing this plan. Preserve tag-only CI policy.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P10-01 | Complete app regression journey | 8 | P08, P09 | All new journeys plus existing onboarding/profile/Sync/history/recovery pass on fresh and migrated fixtures; every inventoried form preserves/restores drafts through top badges; no duplicate/lost tickets, draft loss on cache rebuild or weakened gates. |
| V11-P10-02 | Accessibility and Markdown audit | 5 | 01 | Light/dark axe and keyboard checks pass for forms, board, separators, titlebar and bottom gates; actual screen-reader outcomes and any limitations are recorded. |
| V11-P10-03 | Both-client candidate matrix | 8 | 01 | Genuine matching candidate runs pass audited Claude Code and Codex queue/gate/release/migration scenarios; commands, models, allowed writes, commits and retries are recorded. |
| V11-P10-04 | Packaged candidate and release | 8 | 02, 03 | Aligned artifacts pass packaged/mounted startup, SQLite, editor and Xeploy loading, both full skill installs and checked distribution recovery; actual published download is verified before calling delivery complete. |

## Tests

`make check`, build, complete Electron/accessibility suite, large-project comparison, package/startup and actual downloaded artifact checks under existing release instructions. Include crashes, stale previews, external edits, no OpenRouter, no version source, old client minimum-reader messaging and complete cache reconstruction. Run real-agent checks outside CI only.

## Failure and recovery

Hold delivery when acceptance/evidence is missing. Record actual account or physical-test blockers rather than fabricate passes. Preserve original staged/tagged bytes on partial publication; report completed destinations and the exact remaining checkpoint. Do not delete historical public versions as rollback.

## Exit criteria

All preceding phases are Done, every open decision in the tracker is resolved or explicitly accepted as deferred with precise limits, all stories pass, documentation/instructions/skill references are current and actual evidence/publication outcomes are recorded. U01 was discarded by the user and is not an outstanding requirement. A local candidate alone is not a shipped release.

## Hand-off

Complete `docs/verification/v1.1.0-p10.md`, verification/user documentation indexes, changelog and this tracker. Record the final source/version and any accepted limitations; preserve the original v1 plan/evidence as history.
