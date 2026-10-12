# P16 — v2 architecture documents

> **Milestone:** M4 · **Needs:** P09 · **Status:** see [main.md](main.md)

## Outcome

`docs/architecture/v2/` has one design document per v2 item in VISION.md section 14 (D12). There is no code.

## Requirements

### In scope

Each document covers:

- the problem;
- the proposed design;
- changes to the `.voidra/` format, and whether they are additive under `docs/compatibility.md`;
- changes to the app and the skills;
- risks and open questions;
- what it depends on.

The items:

1. Starting Claude Code or Codex from the app, with live progress.
2. Parallel runs on one machine using git worktrees.
3. More templates and sharing them with the community.
4. Roadmap, milestone and sprint views.
5. Progress and git-activity dashboards.
6. `voidra-report`.
7. Assisted reverting of finished actions.
8. Windows and Linux.
9. An overview across all your projects.
10. Syncing with GitHub Issues or Linear.
11. Maps for large, unclear work.
12. A Prototype action type.
13. Retros after runs.
14. Regular architecture check-ups.
15. Letting mattpocock/skills use `.voidra/` as their issue tracker.

`docs/architecture/v2/Intro.md` indexes them and links back to `docs/intro.md`, following the `init` skill's naming rule.

### Out of scope

Implementation of any of these.

## Blueprint

- Group closely related items into one document when they share a design. For example, items 1 and 2 share the run model, and items 4, 5 and 9 share the views. The index must still list every item.
- Base each design on the v1 architecture as built, read from the code and the evidence files, not on the plan's assumptions.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P16-01 | Agents from the app and parallel runs (items 1 and 2) | 5 | — | Every section above is filled, with the format impact stated. |
| P16-02 | Templates, maps and Prototype (items 3, 11 and 12) | 5 | — | As above. |
| P16-03 | Views, dashboards, report and cross-project overview (items 4, 5, 6 and 9) | 5 | — | As above. |
| P16-04 | Reverts, retros and check-ups (items 7, 13 and 14) | 3 | — | As above. |
| P16-05 | Platforms, issue trackers and mattpocock interop (items 8, 10 and 15) | 5 | — | As above. |
| P16-06 | Index and your review | 2 | P16-01–P16-05 | The index lists all 15 items. You have reviewed the set. |

## Tests

A link check over `docs/` passes.

## Failure and recovery

If a design shows that a v1 decision blocks a v2 item, record it as an open question in [main.md](main.md#open) rather than changing v1 here.

## Exit criteria

All 15 items are covered and you have reviewed them.

## Hand-off

- This phase can run any time after P09, alongside M3.
