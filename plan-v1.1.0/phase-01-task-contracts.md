# V11-P01 — Task contracts and release identity

> **Needs:** completed v1 baseline · **Status:** Done — 2026-10-15 · **Confirmed:** C01–C04; user authorized implementation on 2026-10-15

## Outcome

A first Tasks view reads existing projects without losing records and exposes a correct project release for new tickets.

## Requirements

In scope: task identity, idea/action projection, board organization versus lifecycle, release metadata, version-source discovery, compatibility and safe migration. Out of scope: final Kanban drag/drop, AI intake and release publication.

## Blueprint

Extend the shared format/API first within thin usable stories, with a minimal Tasks projection through the validated bridge. Keep `.voidra/` authoritative and SQLite rebuildable. Preserve existing IDs, rejected ideas, promotion links, parents, blockers, human checklists, unknown fields and historical release memberships. A promoted idea/action pair becomes one visible ticket with traceable provenance.

The confirmed model is one task per executable action, with linked child tasks for larger work. Board columns are Backlog, TODO, In progress, Review and Done; stage/status are independent details. Define mappings for drafts, questions, failed runs, Research, Release, cancelled/rejected work and aggregate parents. Moving between columns must not fabricate lifecycle events.

Read the tracked project's root `package.json` by default, with a per-project alternate package selection, through a bounded local service request without sending manifest contents to AI. For this repository the root's `0.0.0` is not its shipped desktop release; support a contained manifest selection. Missing/invalid versions retain Backlog capture and block moves requiring a release until resolved (C04). Observe version changes without retagging saved tickets automatically.

Add nullable target-release metadata compatibly: default current on creation, allow explicit null in Backlog, require a release outside Backlog. Old records remain readable; propose an explicit previewed migration for active unversioned work, with no fabricated historical released versions. Advertise the minimum reader whenever old clients could misinterpret new semantics; update schemas, fixtures, CLI and generated references together.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P01-01 | Unified task projection | 5 | v1 baseline | Given mixed old ideas/actions, opening Tasks shows each logical ticket once, retaining rejection, parent and provenance details; deleting SQLite reconstructs the same result. |
| V11-P01-02 | Project version discovery | 3 | 01 | Root package.json is the default; a per-project alternate selection is retained; its valid version refreshes on external change; missing/invalid versions preserve Backlog capture and block required-release moves. Escaping/symlinked paths are refused. |
| V11-P01-03 | Release-aware creation and migration | 8 | 02 | New tickets receive current release; Backlog can clear it; non-Backlog null writes fail; old records open and migration preview/apply preserves unrelated bytes and undo. |
| V11-P01-04 | Shared transition contract | 5 | 01, 03 | Given stale revisions or a move that would skip a human gate, the API refuses it; allowed organization changes preserve lifecycle and produce a valid project. |

## Tests

Public format/project inspection and mutation tests; real old/new temporary repositories; cache rebuild; bridge path validation; minimum-reader notices; undo/external-edit conflicts. Include every action type and a legacy human blocker. Add a minimal Electron Tasks/version-source workflow.

## Failure and recovery

No silent bulk migration on open. Preview changed records; use grouped expected-hash writes and existing recovery. Missing version sources retain drafts and existing records. Migration cancellation changes nothing; interrupted writes retain the prior complete snapshot.

## Exit criteria

All four stories implement C01–C04; lifecycle mappings are documented. `make check` passed 424 tests and `make e2e` passed all 70 desktop workflows. See [actual evidence](../docs/verification/v1.1.0-p01.md).

## Hand-off

Update format/compatibility docs, glossary terms, desktop architecture and generated references as contracts change. Give P04/P05 documented creation/move APIs and P09 a distinct target-release versus historical-membership contract.
