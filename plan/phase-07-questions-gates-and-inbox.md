# P07 — Questions, gates and inbox

> **Milestone:** M2 · **Needs:** P04, P06 · **Status:** see [main.md](main.md)

## Outcome

From one **Waiting for you** inbox you can:

- answer question rounds;
- approve or reject plans;
- accept or reject results;
- finish actions done by you;
- confirm inferred profile answers.

## Requirements

### In scope

- **Question rounds** (VISION.md section 8):
  - each question shows its "why";
  - options, with one marked recommended;
  - a free-text answer;
  - **Let the agent decide**.
  - Answers save as you go and record who answered and when.
  - Once every question in a round is answered, the action can be queued again.
- **Assumptions.** A question answered with **Let the agent decide** shows the agent's choice after the next run, marked as an assumption.
- **Plan gate:**
  - show requirements, blueprint and acceptance criteria, with the out-of-scope list, testing seams and proposed ADRs highlighted;
  - **Approve**, or **Request changes** with feedback.
  - approval names the exact bytes of all three plan files (D21). Any subsequent content change, even formatting, requires approval again; the screen explains which file changed.
- **Review gate:**
  - show the run summary, the checks that ran and the files that changed;
  - **Accept**, or **Reject** with feedback.
  - transitions follow the action's lifecycle, including Research and Release. A Release acceptance records authorization and makes the pending finalization queueable for the agent; the app never creates its commit or tag.
- **Inbox:**
  - every waiting item across all actions, grouped by kind;
  - counts in the sidebar;
  - keyboard navigation;
  - the confirm-inferred-answers list from P04 moves here.

### Out of scope

The skill side of these stages (P08).

## Blueprint

- Every gate decision is a change checked by the engine and written to the action's files. The inbox is a view over the index and holds nothing of its own.
- Feedback text is kept in the action's files, so the next `/voidra-go` run reads it.
- A plan or review request carries the revision shown to the user. The service compares it with the current files using P01 helpers before saving; an outside edit rejects the request and refreshes the view. Review revisions include the presented run/results and commit identities, or the Release proposal and plan hashes. Changed content cannot inherit an earlier approval or acceptance.
- Review rejection returns Feature, Bug, Improvement/refactor, Profile change and Docs/chore to Implement; Research returns to Discovery; Release returns to Plan. An implementation type with a stale plan must get approval again before resuming Implement. Template overrides use their validated rejection targets.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P07-01 | Question form | 8 | — | Rounds, options, recommended choice, free text and **Let the agent decide** all work and write a valid `questions.md`. Partly answered rounds are saved. |
| P07-02 | Assumptions | 2 | P07-01 | The agent's choice shows as an assumption, linked to its question. |
| P07-03 | Plan gate | 5 | P01-12 | Approve records the three displayed plan hashes and moves the action on. Request changes saves the feedback and returns it to Plan. An outdated displayed revision cannot be approved. |
| P07-04 | Review gate | 5 | P01-05 | Accept finishes implementation types and Research; rejection targets match the Blueprint. Release acceptance stays in Review pending agent finalization, and rejection returns to Plan. No source file, git tag or version-bump commit is written by the app. An outdated review revision is refused. |
| P07-05 | Inbox | 5 | P07-01, P07-03, P07-04, P04-06 | Every kind of waiting item, including inferred profile answers from P04, appears with correct counts, and the inbox works fully by keyboard. |
| P07-06 | Changed-plan approval | 3 | P07-03 | Changing each plan file independently, including only formatting, invalidates approval, shows the changed file and puts the action back at the approval gate. A fresh approval is required even after a rejected review. |

## Tests

- **Unit:** writing answers, gate changes and inbox grouping.
- **End-to-end (fake agent):**
  1. Discovery round 1 → answer → round 2 → answer.
  2. Plan → request changes → new plan → approve.
  3. Implement → review → reject → rework → accept.
  4. Research review → reject → Discovery → review → accept.
  5. Release review → reject → Plan, and accept → pending agent finalization; P12 completes the commit/tag scenario.
  6. Approve a plan, change each of its three files separately and see fresh approval required. Change a file between display and clicking Approve or Accept and see the stale request refused.
  7. Confirm an inferred profile answer from the inbox and see the count update.

  Plus axe on every new screen.

## Failure and recovery

- If an agent changes `questions.md` while you're answering, you are asked before anything is overwritten.
- A broken plan file is shown with its problem, and approving it is disabled.
- A concurrent edit during a gate decision saves no approval or acceptance for the unseen revision. Refresh the view and let the user decide again.

## Exit criteria

Every story is accepted and the full gate scenario passes with the fake agent.

## Hand-off

- The question form is the screen people use most. Use `ui-ux-pro-max` to get its layout and keyboard flow right.
