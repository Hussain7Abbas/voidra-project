# Progress and Git dashboards

[V2 index](Intro.md) · [Reports](reports.md)

## Problem and built baseline

[Git history](../../../tools/run-engine/src/git.ts) parses actual action trailers; [Sync](../../../tools/run-engine/src/sync.ts) identifies outside work. The [project utility](../../../apps/desktop/src/project-service/workspace.ts) rebuilds SQLite from public records. [P09 performance evidence](../../verification/p09.md) records a measured 1,000-action baseline.

## Proposed design

Project completed, active, blocked and waiting work over selected time ranges. Link every count to the underlying action/run/commit set. Show outside Git activity separately until Sync examines it; commit count is not completion or productivity. Use derived aggregates in the rebuildable index with cancellable bounded queries. Preserve the last complete snapshot during writes, and display timezone and excluded/invalid records beside any metric.

## Format and compatibility

Read-only dashboards need no shared format change. Saved personal filters remain private. Optional shared reporting/group definitions are additive only when users explicitly choose to save them; never persist metric totals as authoritative planning records.

## App and skills

Add accessible charts with equivalent tables and filters. Skills need no change for ordinary dashboards. Agent-generated summaries reference the exact projected record set and remain suggestions rather than claims of completion.

## Risks and open questions

Choose treatment of rework, cancelled actions, squash commits and incomplete histories. Git author dates can be misleading; label the selected time basis. Avoid expensive repository rescans on every render and disclose partial history.

## Dependencies and verification

Depends on v1 indexing, Git reads and Sync; [planning groups](planning-views.md) are optional. Verify rebuild equivalence, changed branches, missing trailers, timezone boundaries, chart/table agreement and the large-project performance budget.
