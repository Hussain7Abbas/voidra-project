# Roadmaps, milestones and sprints

[V2 index](Intro.md) · [Dashboards](dashboards.md)

## Problem and built baseline

The v1 board groups validated actions by lifecycle stage. [Planning helpers](../../../packages/voidra/src/planning.ts) own dependencies, slices and completion; [queue eligibility](../../../packages/voidra/src/queue.ts) uses those rules. [P06 evidence](../../verification/p06.md) verifies them. A calendar must not become a competing completion engine.

## Proposed design

Add named planning groups with goals and optional dates, and explicit action membership. Roadmap and sprint views are alternate projections over the same actions, dependencies and human gates. Move membership with expected revisions through the grouped writer and app undo boundary. A milestone closes only when its stated acceptance rule is met; missing/cancelled actions are visible exceptions, not silently counted as Done. Dates express intention, not authorization to run an action.

## Format and compatibility

New group records and optional action references are additive with a reader minimum. Keep one file per group and random IDs. Define whether an action may belong to multiple groups before schema publication; do not overload `parent`, which already means slicing/aggregate completion. Readers preserve unknown fields and validate membership references.

## App and skills

Add filtering, membership editing and dependency-aware scheduling views with keyboard equivalents. Skills read scheduling context without changing lifecycle rules, assignees or the personal queue automatically.

## Risks and open questions

Set explicit policies for timezone/date-only deadlines, carryover and multi-group membership. Avoid velocity comparisons between people or assuming story points represent elapsed time. Concurrent membership edits require clear conflict handling.

## Dependencies and verification

Depends on v1 board, dependency engine and undo. Test cycles, cancellation, incomplete human work, stale memberships, exact undo and changing group membership after a run consumes it. Shared projections also feed [dashboards](dashboards.md) and [reports](reports.md).
