# P11 — Decisions, assumptions and glossary

> **Milestone:** M3 · **Needs:** P08 · **Status:** see [main.md](main.md)

## Outcome

One searchable index of decisions and assumptions, a glossary view, and links to long-lived docs. The skills write ADRs only when a decision meets the bar (VISION.md sections 5 and 13).

## Requirements

### In scope

- **The decision index** (SQLite full-text search) covers:
  - answered questions;
  - approved plans;
  - ADRs in `docs/adr/`;
  - assumptions: agent-decided answers and profile answers marked assumed.

  It can be searched, filtered by kind, action and date, and links to each source.
- **Revisiting an assumption** creates a Profile change action (for profile answers) or a linked action (for question answers).
- **The glossary screen** is a read-only view of `GLOSSARY.md`. Terms change through actions.
- **Docs links.** The profile's tech blocks and the plan files link to `docs/` pages, which open rendered in the app or in your editor.
- **Skill rules**, refined in `voidra-go` and the architecture skill:
  - an ADR is written only if the decision is hard to reverse, surprising without context and a real trade-off;
  - files are named by date and title, unless the repository already has its own naming;
  - settled terms are added to the glossary.

### Out of scope

Editing the glossary or docs in the app (by design, they change through actions).

## Blueprint

- The index is part of the rebuildable SQLite index (invariant 1 in [main.md](main.md#invariants)). ADRs are read from the repository's `docs/adr/`, never copied into `.voidra/`.
- Assumptions come from answers marked `agent-decides` in `questions.md` and from profile answers marked assumed. There is no separate assumptions file (VISION.md section 5).

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P11-01 | Decision and assumption index | 5 | — | Every kind above is indexed from the `busy-project` fixture and searchable, with links to its source. |
| P11-02 | Revisiting assumptions | 3 | P11-01 | Creates the right kind of action, linked to the assumption. |
| P11-03 | Glossary screen | 2 | — | Renders `GLOSSARY.md`, with search. A missing glossary shows how one gets created. |
| P11-04 | Docs links | 2 | — | Links from profile blocks and plans open the right pages. Broken links are reported. |
| P11-05 | ADR and glossary skill rules | 3 | — | Golden examples cover a qualifying ADR, a non-qualifying decision (no ADR), date naming, existing naming and a glossary addition. All pass `voidra check`. |

## Tests

- **Unit:** ADR parsing, assumption collection and search ranking.
- **End-to-end:** search for a decision; revisit an assumption; open the glossary; follow a docs link; axe.

## Failure and recovery

- An unreadable ADR file is listed with its problem rather than hidden.

## Exit criteria

Every story is accepted.

## Hand-off

- Keep each decision in one place. The index links to its source and never copies it.
