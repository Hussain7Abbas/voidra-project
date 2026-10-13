# P06 — Backlog, actions and lifecycles

> **Milestone:** M2 · **Needs:** P03 · **Status:** see [main.md](main.md)

## Outcome

Ideas, and every action type with its lifecycle, dependencies, slices and actions done by you, on a board and an action page (VISION.md sections 5, 7 and 12).

## Requirements

### In scope

- **Backlog:**
  - create and edit ideas;
  - statuses: new, needs info, ready, promoted and rejected; rejecting requires a reason;
  - promote an idea into an action of a chosen type, linked back to the idea;
  - a list of rejected ideas with their reasons.
- **Actions:**
  - all seven types; Release has its own screens in P12;
  - stage and status come from the lifecycle engine;
  - done by the agent or by you;
  - an assignee, taken from the git identity;
  - a parent and child slices;
  - **blocked by**, with cycles prevented;
  - cancelling.
- **Board:**
  - columns by stage;
  - filters for type, assignee, status and who does it;
  - slices grouped under their parent;
  - blocked actions marked.
- **Action page:**
  - an editable description (a Markdown text area with a preview);
  - a stage timeline;
  - links, read-only plan files and run results;
  - child slices and blockers.
- **Actions done by you:** a checklist of steps. Ticking the last step finishes the action, and finishing it unblocks the agent actions waiting on it.

### Out of scope

Answering questions and the gates (P07), commits (P09) and undo (P10).

## Blueprint

- Every change goes through the `voidra` package's engine, so the app can never write a stage that is invalid for an action's type.
- Editing a file that has changed on disk since it was opened asks you to reload or overwrite.
- Reuse the P03 sanitized Markdown renderer. The vision's ADR bar applies; a reversible library choice alone does not merit an ADR.
- Aggregate parents with no plan files or implementation work complete from accepted child outcomes; their child gates remain mandatory. A parent with its own plan must retain current approval, and one with its own work retains its Review gate.
- Publish the compatible `voidra` 0.2.0 library/validator update before later real-agent checks need its new aggregate behavior. Format remains 1; affected/new metadata advertises the minimum reader version.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P06-01 | Ideas and their statuses | 5 | — | Creating, editing and every status change write valid files. Rejecting requires a reason. |
| P06-02 | Promote an idea | 3 | P06-01 | The new action links to the idea, and the idea links to the action. |
| P06-03 | Action types and the create form | 5 | — | All seven types can be created, with the fields their type needs. |
| P06-04 | Dependencies and slices | 5 | P06-03 | Cycles are refused. Parent and child slices show correctly. The parent is Done only when all its slices are Done. |
| P06-05 | Actions done by you | 3 | P06-04 | Ticking every step finishes the action and unblocks the agent actions waiting on it. |
| P06-06 | Board and filters | 5 | P06-03 | Every filter works. Slices are grouped and blocked actions are marked. The board stays smooth with the `busy-project` fixture. |
| P06-07 | Action page | 5 | P06-03 | Every section listed above renders. Editing the description handles changes on disk. |
| P06-09 | Validator compatibility publication | 3 | P06-04 | New/aggregate planning records advertise voidra 0.2.0. The built and published validators agree; older clients give an update notice. Publication follows local checks and green CI. |
| P06-08 | Assignee from git | 2 | P06-03 | Reads `user.name` and `user.email` from the project's git config. Shows a clear notice when they aren't set. |

## Tests

- **Unit:** filters, changes checked by the engine, cycle refusal and reading the git identity.
- **End-to-end:** idea → promote → action; reject with a reason; block and unblock; slice grouping; ticking off an action done by you; axe on every new screen.

## Failure and recovery

- Changes on disk while editing ask before overwriting.
- An action whose file is invalid is shown with its problem instead of being hidden.

## Exit criteria

Every story is accepted and the `busy-project` fixture shows correctly everywhere.

## Hand-off

- Follow the storylens dashboard's table, badge and form patterns.
