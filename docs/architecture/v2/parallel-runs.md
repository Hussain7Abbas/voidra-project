# Parallel runs through worktrees

[V2 index](Intro.md) · [Agent launch](agent-launch.md)

## Problem and built baseline

V1 deliberately permits one run per checkout. [Locks](../../../tools/run-engine/src/lock.ts), [run guards](../../../tools/run-engine/src/run.ts) and [the writer](../../../packages/voidra/src/writer.ts) refuse competing owners and changed inputs. Existing private queues are personal, not shared scheduling state; [P09](../../verification/p09.md) proves team push/pull refresh and selected-index preservation.

## Proposed design

Keep that lock per checkout. A repository coordinator creates explicitly selected worktrees/branches for independent actions, reserves action IDs in one local repository registry, and dispatches through the supervised launcher. Each worktree has its own index, queue and checkpoints. Dependencies must be satisfied in the worktree's actual commit graph before start. Integration is a separate reviewed operation: inspect incoming code/planning changes, resolve conflicts, preserve exact approved inputs and never automatically merge or push. Removal follows successful integration or an explicit retain/discard decision; snapshot uncommitted work first.

## Format and compatibility

Optional worktree/base/integration provenance on shared runs is additive. The local reservation registry is private and recoverable; it is not cross-machine authority. Random record IDs and one-file-per-record remain. A changed imported plan needs fresh approval, even when the code merge succeeds.

## App and skills

Show each checkout, owner, base and integration state, with separate recovery controls. Skills run unchanged within their assigned root and cannot switch another worktree's index. Release coordination reserves membership and tag names before concurrent planning; actual tag conflicts remain hard stops.

## Risks and open questions

Two machines can still choose the same action; decide whether explicit assignees and integration checks suffice or a clearer manual conflict flow is needed. No reservation server is proposed. Shared Git metadata needs repository-wide serialization for operations that affect all worktrees. Do not treat a stale heartbeat as permission to remove a checkout.

## Dependencies and verification

Depends on [agent launch](agent-launch.md), Git-root detection and existing journal recovery. Test two real worktrees, duplicate reservations, concurrent unrelated staging, changed dependencies, process death and a merge that changes an approved plan. No shared lock weakening is necessary in v1.
