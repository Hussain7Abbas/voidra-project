# Overview across projects

[V2 index](Intro.md) · [Dashboards](dashboards.md)

## Problem and built baseline

V1 provides one canonical project per window, recent-folder shortcuts and independent [utility/index services](../../../apps/desktop/src/project-service/workspace.ts). [Desktop architecture](../desktop.md) and [P02](../../verification/p02.md) record coalesced opens and crash isolation.

## Proposed design

A local overview aggregates bounded read-only summaries from known projects: waiting gates, active owners, blockers and recent releases. Resolve projects by both canonical root and project ID; opening or an explicit refresh verifies the current files. Label missing/offline/read-only projects and the age of cached summaries. Lazily start project readers with a concurrency cap; never leave every project watcher/process running just to display a count.

## Format and compatibility

No shared format change is needed. The known-project registry and summary cache are private and disposable. Cloned repositories with the same project ID remain distinct local checkouts, not silently merged authority. No account or remote server becomes mandatory.

## App and skills

Add an overview with direct links to each project's own window/gate. Mutations still name one project and carry its displayed revision. Skills continue working in one explicit root; a future multi-project report must declare its input set.

## Risks and open questions

Decide opt-in discovery, duplicate clones, refresh limits and network-mounted folders. Do not scan all disk folders or execute Git commands in unknown roots automatically. Avoid cross-project key, queue and undo-history leakage.

## Dependencies and verification

Depends on v1 service supervision/indexes; [dashboards](dashboards.md) provide optional summaries. Test identical IDs in different roots, removed folders, stale caches, slow/malformed projects and project-boundary enforcement for every action.
