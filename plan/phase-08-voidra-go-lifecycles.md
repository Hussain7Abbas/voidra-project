# P08 — `voidra-go` lifecycles

> **Milestone:** M2 · **Needs:** P05, P07 · **Status:** see [main.md](main.md)

## Outcome

`voidra-go` and `voidra-plan` run every action type through its lifecycle exactly as VISION.md section 7 describes, in both Claude Code and Codex.

## Requirements

### In scope

- **`voidra-go` for every type**, building on the P03 queue, lock and run results:
  - **Discovery:**
    - question rounds that never ask something depending on an open answer;
    - adding settled terms to `GLOSSARY.md`;
    - for features, checking first that the feature isn't already built or previously rejected;
    - for bugs, the diagnosis loop: reproduce, shrink the case, form a hypothesis, instrument, root cause;
    - for profile changes, the impact on code, documents and open actions.
  - **Plan:**
    - requirements with what is out of scope, a blueprint with testing seams and proposed ADRs, and acceptance criteria;
    - splitting work into slices when it won't fit one session;
    - expand–contract for wide refactors.
  - **Implement:** test-first at the agreed seams, with mocks only for outside things.
  - **Verify:** the project's checks, then the two-part review against the `AGENTS.md` rules and against the plan. Problems are fixed before the commit.
  - **Commit:** one per action or slice, with the trailer, following the project's message style.
  - Creating actions done by you when the agent reaches a step only a person can do.
  - A failed result that explains why, when something goes wrong.
- **Research:** findings, a recommendation and proposed ideas or actions. No code.
- **`voidra-plan` (D22):** runs only the planning stages. It may write `.voidra/` and add settled terms to the repository-root `GLOSSARY.md` during Discovery. It changes no source code or other repository files and makes no commits or tags. Paths and operation manifests use the same containment checks as the P01 helpers, including a glossary symlink that points outside the project.
- **Template skills:** `voidra-go` uses the project's template architecture skill during Discovery and Plan.
- **Agent differences:** one skill text that works in both Claude Code and Codex. Record the differences you find in `docs/agents.md`.
- **Fake-agent scenarios** for every type, for the app's end-to-end tests.

### Out of scope

Releases and `voidra-sync` (P12) and ADR naming details (P11).

## Blueprint

- **Skill structure:**
  - `SKILL.md` holds the loop and the rules;
  - each stage has its own guide in `references/`;
  - the generated format and lifecycle pages from P01 are also in `references/`.
- Every completed single-file write or grouped operation is followed by `npx voidra@0 check`, and a failed check is fixed before the run continues. All mutations use the P01 helpers and the P03 lock/start/checkpoint protocol.
- For types with a plan gate, compare the approved hashes of all three plan files before implementation or rework. Any change stops at Plan for approval again, including when the app is closed. Docs/chore and Research need no plan files or plan approval; Release's Review authorization is checked by P12. Review rejection follows the type's valid rework stage; Research has no Implement stage.
- Recovery reconciles checkpointed writes and commits before advancing or retrying. Work after an interrupted commit uses its existing `Voidra-Run` trailer, not a second commit. The agent must not stage pre-existing user edits as part of its action; record the starting git state and stop if an action overlaps edits that cannot be separated safely.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P08-01 | Queue, lock and run results for every type | 3 | — | Mixed queues run in the queue's order. Every action stops at its next gate. |
| P08-02 | Discovery behaviours | 5 | P08-01 | A golden example for each behaviour listed above passes `voidra check`. |
| P08-03 | Plan behaviours and slicing | 8 | P08-02 | Golden plans have seams, out-of-scope items and ADR proposals. A golden slice split has the right blocked-by links. |
| P08-04 | Implement and Verify | 5 | P08-03 | The guides require test-first at seams and the two-part review. A golden run result records both review parts. |
| P08-05 | Commits | 3 | P08-04 | One commit per action or slice, with the trailer and the project's message style. A rejected review adds a follow-up commit with the same trailer. |
| P08-06 | Research | 2 | P08-02 | The golden research result passes `voidra check` and proposes ideas. |
| P08-07 | Actions done by you | 2 | P08-01 | The golden example has steps and blocks the agent's own action. |
| P08-08 | `voidra-plan` | 3 | P08-03 | Runs planning only. Snapshot comparison allows `.voidra/` and settled-term additions to the repository-root `GLOSSARY.md`, rejects source-code and other repository writes, and proves HEAD and tags are unchanged. A glossary symlink escape is refused. |
| P08-09 | Agent differences and real-agent checks | 5 | P08-05, P08-06, P08-07 | `docs/agents.md` exists. Both agents run Feature, Bug, Improvement/refactor, Research, Profile change and Docs/chore scenarios, with slices and human blockers, using the matrix. Record valid output, correct gate stops, rework targets, architecture dispatch, write paths and commits in the evidence file. |
| P08-10 | Approval enforcement and interrupted-run recovery | 5 | P08-05, P01-12, P03-11 | With the app closed, a changed approved plan stops work for approval again. A fake-agent run interrupted after a commit reconciles that commit on resume, keeps the consumed-record start marker and produces no duplicate commit. A conflicting outside edit stops recovery. |
| P08-11 | Planning skill real-agent checks | 3 | P08-08, P08-10 | Both agents run `voidra-plan` through Discovery and Plan, update settled glossary terms, and stop before implementation. File and git snapshots prove the D22 restrictions. A changed approved plan is tested before a subsequent `voidra-go` resume, with no code written until approval again. Commands, models and results are recorded. |
| P08-12 | Gate/runtime hand-off follow-ups | 5 | P08-01, P07 | Validate and honor template lifecycle overrides at disk helpers and app gates; activate Profile change drafts only through an explicit displayed-revision user decision; protect terminal human answer history. Unchanged sibling stale gates cannot prevent another action’s fresh approval or safe queueing. |

| P08-13 | Deferred theme-palette follow-up | 2 | P07 | Repair P07 CI’s offscreen board contrast failure. Theme colors change together even for content painted later; no disabled axe rule or arbitrary delay. Keyboard navigation remains intact. |

## Tests

- Skill lint, golden examples checked by `voidra check`, and the staleness check on generated references.
- **End-to-end:** a fake-agent scenario for each type through the app.
- **Real-agent checks (local, headless):** P08-09 and P08-11, following the coverage matrix. They are not part of CI (D06).
- **Integration/fake-agent:** invalidated approval with no app running, interrupted write/commit recovery, stale review requests and pre-existing user edits.

## Failure and recovery

- An agent stopped mid-run leaves a persisted start record, an unfinished result/checkpoint and possibly a stale lock. Recovery follows P03 and never treats an absent completed result as proof that no work happened.
- A failed `voidra check` that the agent can't fix ends the run with a failed result naming the file.

## Exit criteria

Every story is accepted. Every type passes end-to-end with the fake agent, and the real-agent checks are recorded.

## Hand-off

- Write the skills as instructions an agent can follow without the app. Never refer to app screens.
- Keep `SKILL.md` short and move the details into references.
