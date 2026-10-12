# Plan documentation rules

These rules extend the [root `AGENTS.md`](../AGENTS.md) for this directory.

- This directory holds the implementation plan, not application code or claims of finished work.
- [`../VISION.md`](../VISION.md) defines the product. If the plan and the vision disagree, the vision wins: fix the plan. If implementation shows that the vision itself should change, ask the user first, then update both in the same commit.
- [`main.md`](main.md) is the canonical index. Keep its phase table, status column, decision register, requirement coverage and milestone list consistent with the phase files.
- Every phase file has these sections, in this order: **Outcome**, **Requirements** (in scope and out of scope), **Blueprint**, **Stories**, **Tests**, **Failure and recovery**, **Exit criteria** and **Hand-off**.
- Stories have an ID (`PXX-NN`), relative points (1, 2, 3, 5 or 8, always below 13), the stories or phases they need, and acceptance criteria someone can observe. Points compare effort between stories; they are not calendar estimates.
- Record open questions in the decision register in `main.md` and mark the affected phases. Never present a proposal as a user answer.
- For an approved planning correction, update the decision register, vision where behavior changes, phase dependencies, acceptance criteria and tests together. Keep implementation status and evidence unchanged until implementation actually runs.
- Follow the root instruction to ask decision questions directly in chat with lettered options and an explicit single-choice or multiple-choice label.
- Tests use Vitest (unit and integration) and Playwright (Electron end-to-end). The fake agent tests the app's side of the loop only. Never describe a fake-agent run as proof that Claude Code or Codex behave correctly. A real-agent check counts only when it actually ran, following the procedure in the root `AGENTS.md`, and its commands, model IDs and results are recorded in the phase's evidence file.

## While a phase is being implemented

- Phases start when the user says "run the next phase" (or names one). The workflow is in the root `AGENTS.md`. Never write steps that need the user to paste a prompt or run a command; the agent does the work and asks only for decisions and approvals.
- Set its status to **In progress** in `main.md` when work starts, and to **Done** with the date when every exit criterion is met.
- If a phase is **Blocked**, explain why at the top of its phase file and in the status cell.
- Write the evidence file `docs/verification/pXX.md`: what was built, the checks that ran and their results, and anything unverified with the reason. Link it from the Evidence column.
- If a finished phase needs a change later, add a follow-up story to the next suitable phase instead of silently editing the finished one.

Keep the sibling `CLAUDE.md` containing exactly `@AGENTS.md`.

Keep these rules current when the plan's structure or maintenance workflow changes, following the root documentation-maintenance rule.
