# P05 — The general template

> **Milestone:** M2 · **Needs:** P04 · **Status:** see [main.md](main.md)

## Outcome

The general software template — its profile blocks, its questions and its architecture skill — reviewed and approved by you before it ships (D14).

## Requirements

### In scope

- **Research.** Collect candidate profile blocks from:
  - VISION.md: problem, users, features and modules, tech stack, design system, integrations, data, deployment and constraints;
  - your first message: idea, architecture, technologies, libraries and design system;
  - the 120x intake: business problem, users, current workflow, desired outcome, source materials and constraints.
- **Draft** `templates/general/template.yaml`. Each block gets its questions, a question type, help text and an example answer.
- **Your review gate.**
  - Write `docs/templates/general-review.md`, showing every block and question in plain language with the reasoning for each.
  - You approve it or ask for changes, and this repeats until you approve.
  - The approval date is recorded in the evidence file.
- **The architecture skill**, `skills/voidra-architect-general/`. It covers:
  - running Discovery question rounds from the profile;
  - writing requirements (with what is out of scope), a blueprint (with testing seams and proposed ADRs) and acceptance criteria;
  - splitting work that doesn't fit one session into slices;
  - proposing the Bootstrap plan for a new project.

  Its references are the generated format and lifecycle pages, and its golden examples pass `voidra check`.
- Template version 1.0.0 and the format version it needs.

### Out of scope

More templates and template sharing (v2).

## Blueprint

- Fewer, sharper questions beat many. Each question must change what the agent does. If no later stage would read an answer, drop the question.
- Every question says why it matters, because that text becomes the "why" when the agent asks follow-up questions.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P05-01 | Research and draft | 5 | — | The draft template validates. The review document lists every block and question with its reason. |
| P05-02 | Your review | 3 | P05-01 | You approve it. Each round of changes is recorded. |
| P05-03 | Architecture skill | 8 | P05-01 | The skill covers every point in scope. `SKILL.md` stays short, with the details in references. The skill passes lint. |
| P05-04 | Golden examples | 3 | P05-03 | Examples for a Discovery round, a plan with seams and an ADR proposal, a slice split and a Bootstrap plan all pass `voidra check`. |
| P05-05 | Versioning | 2 | P05-02 | `template.yaml` declares version 1.0.0 and its format. A mismatch is reported clearly. |
| P05-06 | Architecture skill real-agent checks | 3 | P05-02, P05-03, P05-04, P05-05 | In both agents, invoke the architecture skill directly on temporary projects: a Discovery round and Bootstrap plan exercise seams and an ADR proposal; a large request produces linked slices. Outputs pass `voidra check`, no implementation starts before approval, and commands, model IDs, write paths and gate stops are recorded. |

## Tests

- The template validates; the golden examples pass `voidra check`; the skill passes lint.
- **End-to-end:** onboarding with the final template.
- **Real-agent checks:** P05-06 runs locally following the root procedure and the matrix in `main.md`; valid examples alone do not satisfy this story.

## Failure and recovery

If the review stalls, the phase stays **In progress**. M2 can't be reached without an approved template.

## Exit criteria

Your approval is recorded, the skill and examples pass every check, and P05-06 evidence records the architecture skill in both real agents.

## Hand-off

- Present the draft for review before polishing the skill. The skill depends on the approved questions.
