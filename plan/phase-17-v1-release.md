# P17 — v1 release

> **Milestone:** M4 (completes it) · **Needs:** P10–P16 · **Status:** see [main.md](main.md)

## Outcome

v1.0.0 ships, with recorded evidence that everything in the VISION.md v1 scope works.

## Requirements

### In scope

- **Full regression:** `make check`, the end-to-end suite and the packaged smoke test, all green in CI, with coverage targets met (D07).
- **Accessibility:**
  - axe on every screen in both themes;
  - a keyboard-only pass, automated with Playwright;
  - a VoiceOver pass over the main flows: the only manual test, done by you.
- **Performance:** measure again with the `large` fixture and compare with the P09 baseline and budget.
- **A clean install, automated:** download the release DMG with `gh`, mount it, copy the app to a temporary folder, start it with a fresh data folder, install the skills into a temporary home folder for both agents, and open a fixture project.
- **The real-agent check (D17):**
  - the full [real-agent coverage matrix](main.md#real-agent-coverage-matrix), run headlessly by the agent in Claude Code with Haiku and in Codex with Luna, both at low reasoning effort, following the real-agent check procedure;
  - all five public skills, the architecture skill and every action type are exercised using release-candidate skills, including `voidra-plan` write restrictions, `voidra-sync` repeat runs, review rework targets and changed-plan approval;
  - record the exact model IDs and effort settings;
  - if a step fails, rerun it with that agent's default model. A failure with both models points to the skill, so fix it. A failure only with the small model is recorded as a model limit.
- **Docs:** README, `docs/` (including a user guide), `GLOSSARY.md` and the changelog are complete and their links pass.
- **Release:**
  - tag v1.0.0 through `make release`;
  - the GitHub Release is published;
  - `voidra` 1.0.0 is on npm;
  - the skills are synced to `voidra-skills`.

### Out of scope

New features. Anything found here becomes a bug action in Voidra's own `.voidra/`, or a blocker if it breaks the vision.

## Blueprint

Every check writes its result into `docs/verification/p17.md`, with the date, the machine and the result. "Passed" is never claimed without a recorded run.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P17-01 | Full regression | 3 | — | All green in CI on the release commit, with coverage met. |
| P17-02 | Accessibility audit | 3 | — | Axe is clean, the automated keyboard pass passes, your VoiceOver pass is recorded, with any problems fixed or tracked. |
| P17-03 | Performance check | 2 | — | The numbers are recorded and meet the budget, or the gap is explained and accepted by you. |
| P17-04 | Clean install | 2 | — | The automated clean-install run passes and is recorded. |
| P17-05 | Real-agent check | 8 | — | Every row of the real-agent coverage matrix is recorded for both agents using release-candidate skills, with model IDs, effort, validity, write paths, gate stops and git state. Every failure is classified as a skill problem (fixed) or a model limit (recorded); no skill or action type is silently omitted. |
| P17-06 | Docs complete | 2 | — | The link check passes, and the README, user guide and changelog are current. |
| P17-07 | Ship v1.0.0 | 2 | P17-01–P17-06 | The tag, GitHub Release, npm package and synced skills all exist and match. |

## Tests

This phase runs everything above and adds no new test suites.

## Failure and recovery

A blocking problem stops the release. Fix it in a follow-up and re-run the affected checks; never mark a check passed from memory.

## Exit criteria

v1.0.0 is published everywhere, the evidence file is complete, and M4 is marked reached in [main.md](main.md).

## Hand-off

- Read every earlier evidence file first. They list what each phase couldn't verify.
