# V11-P05 — Tasks Kanban and release filters

> **Needs:** P04 · **Status:** Not started · **Confirmed:** C01–C03 · **Proposals:** record/migration details in A01, A02, A07

## Outcome

Tasks replaces the separate Backlog and Actions pages with draggable cards and release-aware work organization.

## Requirements

In scope: unified navigation, board columns, card details, pointer/keyboard movement, release filtering and migration of existing links. Out of scope: bypassing lifecycle gates, release publication or adding analytics dashboards.

## Blueprint

Build on P01's shared transition contract and P04's creators. Backlog becomes a column; “Add task” and “Add to Backlog” retain Normal/Agentic input modes. Keep existing action detail, plan files, questions, commits, blockers, slices and human checklists reachable from cards. Redirect old Backlog/Actions navigation and source links into the matching task rather than losing them.

Use the confirmed columns Backlog, TODO, In progress, Review and Done. One card represents one executable action; large work uses linked child tasks. Card movement is a user intent checked by the engine; moving to Done cannot accept work, moving to Review cannot invent verification, and moving backward cannot erase consumption or approvals. Show stage-specific progress inside the broad columns. Define observable refusals and the appropriate gate action when a destination cannot be reached by a drag.

Default a new ticket to the current project release. Backlog can explicitly clear release. Leaving Backlog with null release assigns current in the same grouped mutation. C03 confirms that already versioned tickets retain their assignment on ordinary moves, even when it differs from current. Missing current version blocks a required-version move with a recoverable explanation.

The release dropdown lists Current with its actual number, previous known releases, All releases and Unassigned Backlog. Derive options from saved release records and ticket assignments, deduplicate and sort versions sensibly. Filter the board only; it must not delete hidden cards from the Actions sequence or let dragging a filtered subset overwrite unseen order.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P05-01 | Unified Tasks navigation | 5 | P04 | Tasks displays all existing logical tickets once, with Backlog as a column; former page links open the corresponding card/detail. |
| V11-P05-02 | Drag and keyboard moves | 8 | 01 | Pointer drag and keyboard alternatives persist the same allowed move; stale/illegal moves revert with an explanation; approvals remain unchanged. |
| V11-P05-03 | Required release on movement | 3 | 02 | A null Backlog ticket receives current release on TODO drop; a ticket assigned an older release retains it on ordinary moves; explicit Backlog null remains valid; missing source and undo follow the shared contract. |
| V11-P05-04 | Release and task filters | 3 | 03 | Current/previous/All/Unassigned options show the correct cards; filtering does not change stored records or global queue order. |

## Tests

Mixed legacy/busy project; every action type; accepted/rejected gates, drafts, failed runs, human blockers and slices. Real Electron drag/drop and keyboard moves, drop cancellation, external refresh during drag, filtered board, version change, undo/redo and light/dark accessibility. Retain the large-project baseline and measure regressions.

## Failure and recovery

Use current displayed hashes, one grouped move/release write and existing history classification. Reject stale drops without reordering other cards. Keep selection and explain where a card went when the active release filter hides it after a move.

## Exit criteria

C01–C03 are implemented and board mappings documented; all stories and `make check` pass; separate Backlog/Actions pages no longer remain primary navigation. Actual evidence includes drag/drop and keyboard use.

## Hand-off

Update board/backlog architecture and user guide. P06 consumes TODO membership events without duplicate enrollment; P07 adds final pane layout.
