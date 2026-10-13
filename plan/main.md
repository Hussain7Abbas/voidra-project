# Voidra Project — implementation plan

> **Status:** implementation started on 2026-10-12. P00–P10 are Done; P11 is In progress. M1 and M2 were reached on 2026-10-13. Review corrections were incorporated on 2026-10-12.
> Product decisions live in [VISION.md](../VISION.md). The rules for this folder are in [AGENTS.md](AGENTS.md).

## Session hand-off — 2026-10-14

Continue P11, then through P17 under D24. P00–P10 are Done; P11 is In progress; P12–P17 remain Not started. Do not repeat generic phase permission questions. Resolve delegated questions/reviews from the approved vision and record agent decisions honestly; account access and physical checks still need actual evidence.

P09 reached M2 and passes quality, 44 desktop workflows, packaging and packaged startup. P10's corrected implementation `5965420` passes [CI](https://github.com/Hussain7Abbas/voidra-project/actions/runs/38457428517): all quality/coverage/freshness checks, the complete desktop/accessibility suite, packaging and packaged SQLite startup. [P10 evidence](../docs/verification/p10.md) records exact replay, durable consumption, overwrite confirmations, routing coverage, onboarding undo/reinitialization and native menu behavior. Local focused checks pass fourteen helper tests and five desktop scenarios.

- P11 is implemented in the working tree: shared decision collection/assumption revisits, SQLite FTS5, bounded document reads, both screens, profile/plan docs links and ADR/glossary goldens. All 322 quality tests, coverage/freshness checks and both focused UI themes pass; full desktop/package/CI closure remains pending. New mutations use P10’s classified writer boundary.
- Keep runtime inputs stable during checks. Native fixture bundles use inline maps and an explicit ignored coverage-input glob; production gates remain unchanged. Their scripts are retained until reporting, then cleared by the next engine test. Idle-sleep prevention cannot prevent lid-close sleep: macOS logs confirm long interruptions that invalidate local timing checks. CI provided uninterrupted whole-suite evidence. Hosted macOS runner capacity failures are distinct from code failures.
- This repository's profile remains nine blocks/17 inferred answers from validated Codex default intake. `idea-0g353s` tracks open-time variance; `act-jxg00v` tracks the non-Git Bootstrap/repository-root follow-up. Neither is claimed implemented. Root offline CLI links workspace 0.2.0; public npm remains 0.1.0 until P15 under D25. Real-agent fixtures must install a genuine freshly packed matching candidate.
- Preserve exact approval hashes, durable consumption/ownership, selected Git recovery and private-file exclusions. Check the remaining standalone non-Git Bootstrap/subfolder boundary before release (P17 follow-up).
- Phase commits/pushes use Hussain7Abbas's existing authentication without changing the active account. P17 still needs real human VoiceOver evidence. P15 may need one npm account/website step; D24 does not authorize invented results.

## Sources of truth

- [VISION.md](../VISION.md) defines what Voidra Project is and how it behaves. It wins over this plan.
- This file is the implementation index: phase order, status, decisions, architecture overview and testing strategy.
- Each phase file is the source of truth for its own scope, stories and acceptance criteria.

## How to run a phase

You never paste anything. Open Claude Code or Codex in this folder and say **"run the next phase"**, or "continue", or "run P05". The root [AGENTS.md](../AGENTS.md) is loaded automatically by both agents and tells them what to do:

1. pick the phase (the one in progress, otherwise the first one whose needs are Done);
2. read the vision, this plan, the phase file and the evidence of the phases it needs;
3. show an understanding check; wait for your go-ahead unless you have explicitly authorized all phases non-stop (D23);
4. implement story by story, tests first, with `make check` after each story;
5. do every step itself, including all GitHub work with `gh` and the real-agent checks, run headlessly with low-cost models;
6. write the evidence file, update this table, commit and push, then tell you what's next.

You are asked only for decisions and named approvals unless expressly delegated, and for anything that needs your accounts. The only manual tasks left for you are a VoiceOver pass before release (P17) and possibly one npm website step (P15).

## Phase index

Status values: **Not started**, **In progress**, **Blocked** (with the reason), **Done** (with the date).

| Phase | Document | Outcome | Needs | Milestone | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P00 | [Repository foundation](phase-00-repository-foundation.md) | Public repo, tooling, standards, CI | — | M1 | Done (2026-10-12) | [p00](../docs/verification/p00.md) |
| P01 | [Format and the `voidra` package](phase-01-format-and-voidra-package.md) | One package that defines, reads, writes and checks `.voidra/` | P00 | M1 | Done (2026-10-13) | [Evidence](../docs/verification/p01.md) |
| P02 | [Desktop shell and design system](phase-02-desktop-shell-and-design-system.md) | Secure Electron app, Ink & Iris UI, project windows, packaging smoke | P00 | M1 | Done (2026-10-13) | [Evidence](../docs/verification/p02.md) |
| P03 | [Tracer bullet](phase-03-tracer-bullet.md) | One action from the app through `/voidra-go` and back | P01, P02 | M1 | Done (2026-10-13) | [Evidence](../docs/verification/p03.md) |
| P04 | [Onboarding, profile and `voidra-init`](phase-04-onboarding-profile-and-init.md) | Both ways in; editable profile | P03 | M2 | Done (2026-10-13) | [Evidence](../docs/verification/p04.md) |
| P05 | [The general template](phase-05-general-template.md) | Profile questions and architecture skill, approved by you | P04 | M2 | Done (2026-10-13) | [Evidence](../docs/verification/p05.md) |
| P06 | [Backlog, actions and lifecycles](phase-06-backlog-actions-and-lifecycles.md) | Ideas, every action type, dependencies, slices, actions done by you | P03 | M2 | Done (2026-10-13) | [Evidence](../docs/verification/p06.md) |
| P07 | [Questions, gates and inbox](phase-07-questions-gates-and-inbox.md) | Question rounds, plan and review gates, Waiting for you | P04, P06 | M2 | Done (2026-10-13) | [Evidence](../docs/verification/p07.md) |
| P08 | [`voidra-go` lifecycles](phase-08-voidra-go-lifecycles.md) | Skills run every action type as the vision describes | P05, P07 | M2 | Done (2026-10-13) | [Evidence](../docs/verification/p08.md) |
| P09 | [Runs, commits and teams](phase-09-runs-commits-and-teams.md) | Safe daily use; dogfooding starts | P08 | M2 | Done (2026-10-13) | [Evidence](../docs/verification/p09.md) |
| P10 | [Undo and redo](phase-10-undo-redo.md) | ⌘Z and ⇧⌘Z for every app edit | P07 | M3 | Done (2026-10-13) | [Evidence](../docs/verification/p10.md) |
| P11 | [Decisions, assumptions and glossary](phase-11-decisions-assumptions-and-glossary.md) | One decision index, glossary view, ADR rules | P08 | M3 | In progress | [P11](../docs/verification/p11.md) |
| P12 | [Releases and `voidra-sync`](phase-12-releases-and-sync.md) | Releases from done actions; catching up with outside work | P09 | M3 | Not started | — |
| P13 | [AI in the app](phase-13-ai-in-the-app.md) | Optional OpenRouter features | P04, P06, P12 | M3 | Not started | — |
| P14 | [Skills distribution](phase-14-skills-distribution.md) | App installs and updates skills; releases sync `voidra-skills` | P08, P12 | M3 | Not started | — |
| P15 | [Packaging and updates](phase-15-packaging-and-updates.md) | DMG on GitHub Releases, update notices, npm publishing | P14 | M4 | Not started | — |
| P16 | [v2 architecture documents](phase-16-v2-architecture-docs.md) | One design document per v2 item | P09 | M4 | Not started | — |
| P17 | [v1 release](phase-17-v1-release.md) | v1.0.0 shipped with recorded evidence | P10–P16 | M4 | Not started | — |

Phases whose needs are met can run in parallel. P16 is documentation only and can start any time after P09.

## Milestones

| Milestone | Reached when | What you can do then |
| --- | --- | --- |
| **M1 — Tracer bullet** | P00–P03 are Done | Create a docs action in the app, run `/voidra-go` in Claude Code or `$voidra-go` in Codex, watch the result appear and accept it. |
| **M2 — Core loop** | P04–P09 are Done; reached 2026-10-13 | Use Voidra for real work: profile, backlog, every action type, question rounds, plans, reviews, commits and teams. **Dogfooding starts:** Voidra Project gets its own `.voidra/` and tracks its new ideas and bugs there. This plan keeps tracking the remaining phases. |
| **M3 — Feature-complete** | P10–P14 are Done | Everything in the VISION.md v1 scope works. |
| **M4 — Released** | P15–P17 are Done | v1.0.0 is on GitHub Releases, `voidra` is on npm, and the skills are on skills.sh. |

## Decisions

### Confirmed

| ID | Decision | Source |
| --- | --- | --- |
| D01 | One public GitHub repository, `voidra-project`, public from day one. Agents do all GitHub work with the `gh` CLI, including creating the repository; you never need the GitHub website. The repository belongs to **Hussain7Abbas** (D19). | You, 2026-10-11 |
| D02 | pnpm workspace: `apps/desktop`, `packages/voidra`, `tools/*`, plus `skills/`, `templates/` and `fixtures/` folders. | You, 2026-10-11 |
| D03 | One npm package, `voidra`: the format schemas, parser, lifecycle rules, validator and the `voidra` CLI (`npx voidra check`). You are logged in to npm. | You, 2026-10-11 |
| D04 | Skills and templates are developed in this repository and bundled in the app. Release copies them to the `voidra-skills` repository for skills.sh. This replaces the earlier "skills live in `voidra-skills`" decision. | You, 2026-10-11 |
| D05 | No Apple Developer account. The build is unsigned. The app checks GitHub Releases and tells you when a newer version exists; you download it yourself. | You, 2026-10-11 |
| D06 | No tests with real agents in CI. A fake agent drives the end-to-end tests. | You, 2026-10-11 |
| D07 | Coverage: 90% of lines in `packages/voidra`, 80% in the desktop main-process and project-service code, no target for UI components. | You, 2026-10-11 |
| D08 | The UI copies the storylens dashboard's whole Ink & Iris system: light, dark and system themes, Inter, Lucide icons, radii, spacing, focus rings and component patterns. Design happens as we build, with the `ui-ux-pro-max` skill. | You, 2026-10-11 |
| D09 | English only in v1. | You, 2026-10-11 |
| D10 | Phases run in Claude Code or Codex. You start one by saying "run the next phase", and never paste prompts; the workflow lives in the root `AGENTS.md`. This file tracks progress in a status column. | You, 2026-10-11 |
| D11 | Repository standards: a Makefile from `makefile-standards`, `AGENTS.md`/`CLAUDE.md`/`docs/` from `init`, and the five compatibility-policy parts specified in P00, adapted to `.voidra/`. `api-backward-compatibility` is a reference when installed; P00's self-contained contract is the fallback when it is unavailable. | You, 2026-10-11; fallback is an implementation detail under the approved review corrections, 2026-10-12 |
| D12 | v2 architecture documents live in `docs/architecture/v2/`. | You, 2026-10-11 |
| D13 | Build order: the format first, then a thin end-to-end slice, then widen in slices. Four milestones, with dogfooding from M2. | Delegated to me ("best for quality") |
| D14 | The general template is drafted in P05, and your review is a gate before it ships. | Delegated to me |
| D15 | Plan format: your Voidra Agentic OS format, plus requirements, blueprint and a hand-off prompt per phase (from the 120x method). | Delegated to me |
| D16 | Apple Silicon only. There is no Intel build. | You, 2026-10-11 (was O1) |
| D17 | Real-agent checks are run by the implementing agent itself, headlessly and locally (`claude -p`, `codex exec`), during the phases that ask for them and before each release. They use low-cost models at low effort: Haiku (`claude-haiku-4-5`) in Claude Code and Luna (`gpt-6-luna`) in Codex. Use whichever is the current Haiku or Luna model at the time, and record the exact IDs. | You, 2026-10-11 (was O2) |
| D18 | The app icon is designed in P15 and needs your approval. | You, 2026-10-11 (was O3) |
| D19 | `voidra-project` belongs to the GitHub account **Hussain7Abbas**, like `voidra-skills`. Agents use that account's token for GitHub work without switching your active `gh` account. | You, 2026-10-11 (was O4) |
| D20 | Incorporate all nine review findings into the existing phases, with observable acceptance criteria and tests. This is a plan correction, not permission to start an implementation phase or a claim that checks have run. | You, 2026-10-12 (question 1a) |
| D21 | Any content change to requirements, blueprint or acceptance criteria invalidates plan approval, including formatting-only edits. Record and compare exact file-content hashes; require approval again. | You, 2026-10-12 (question 2a) |
| D22 | `voidra-plan` may update the repository-root `GLOSSARY.md` during Discovery as well as `.voidra/`. It changes no source code or other repository files and makes no commits or tags. | You, 2026-10-12 (question 3b) |
| D23 | Continue through all remaining phases non-stop. Report understanding/progress in commentary without repeating generic phase approvals; retain explicitly named product review gates unless separately delegated, and account actions requiring the user. | You, 2026-10-13 |
| D24 | Continue non-stop until P17 is completed; resolve questions and named design/document reviews using the approved vision. Record delegated decisions as agent decisions, not personal user reviews. Account access and physical checks still require actual evidence. | You, 2026-10-13 |
| D25 | P06 prepares voidra 0.2.0 for new planning APIs and aggregate validation. Format stays 1 and new forms advertise the minimum reader. npm requires an authenticator code; registry publication remains P15. Earlier real-agent fixtures install the genuine locally packed candidate so npx uses the same validated CLI as the app. | Agent decision under D24, 2026-10-13 |

### Open

None. O1–O4 were answered on 2026-10-11 and became D16–D19.

## Architecture overview

### Repository layout

```text
voidra-project/
├── apps/desktop/        Electron app: main process, project service, preload bridge, Next.js renderer
├── packages/voidra/     npm package "voidra": .voidra format, lifecycles, validator, CLI
├── skills/              voidra-init, voidra-go, voidra-plan, voidra-sync, voidra-release, voidra-architect-general
├── templates/general/   the general template's profile blocks, questions and lifecycle overrides
├── tools/fake-agent/    a scripted stand-in for /voidra-go in end-to-end tests
├── fixtures/            sample projects, valid and broken, shared by every test suite
├── docs/                intro.md, format/, architecture/, adr/, verification/, compatibility.md
├── plan/                this plan
├── GLOSSARY.md, VISION.md, README.md, LICENSE, AGENTS.md, CLAUDE.md, Makefile
└── .github/workflows/   ci.yml, release.yml, publish-npm.yml
```

### Runtime parts

| Part | Owns | Must not |
| --- | --- | --- |
| Renderer (Next.js static export, React, Tailwind) | Screens, forms and UI state | Touch files, git, the network or secrets directly |
| Preload bridge | A small typed API; every request and response is checked with zod | Pass arbitrary messages through |
| Main process | Windows, menus, dialogs, Keychain (`safeStorage`), the update check, OpenRouter calls and skill installation | Do long-running file or index work |
| Project service (Electron utility process, one per open project) | Reading and writing `.voidra/` through the `voidra` package, file watching, the SQLite index, undo history, git reads and the planning commit | Hold format or lifecycle rules of its own |
| `voidra` package | Format schemas, parsing and writing, IDs, lifecycle rules, validation and migrations | Depend on Electron |
| Skills | Instructions the agents follow. They run `npx voidra check` on everything they write. | Depend on the app being open |

P02 confirmed the utility-process split in its [ADR](../docs/adr/2026-10-13-utility-process.md), so heavy file work cannot freeze or crash the window.

### Invariants

1. Everything the app shows can be rebuilt from `.voidra/`, the repository's docs and git history. Deleting the SQLite index loses only undo history.
2. The app writes only inside `.voidra/` and its own data folder. Its only git write is **Commit planning changes**, which commits `.voidra/` without `.voidra/local/`.
3. There is one set of format and lifecycle rules: the `voidra` package. The app, the CLI and the skills' reference files all derive from it. Generated skill references are checked for staleness in CI.
4. Readers ignore fields they don't know. A project in a newer format than the app supports opens read-only, with a notice to update.
5. Every bridge request is typed and validated, and every write names its project.
6. Plan approvals name the exact hashes of all three plan files. Gate decisions compare the displayed revision with the current files before saving. A changed plan always needs approval again (D21).
7. The package supplies atomic file writes, expected-hash checks and durable operation checkpoints. The app and skills use them for multi-record changes and interrupted-run recovery; SQLite is never the only recovery source.
8. Before agent work begins, a persistent run-start record identifies the action and consumed records. Undo is blocked from this point, including during active or interrupted runs.

## Testing strategy

### Unit and integration tests (Vitest)

- **`packages/voidra`:** schemas, byte-stable read/write round trips, IDs, lifecycle transitions, validator messages and migrations. 90% line coverage.
- **Desktop main process and project service:** loading, watching, index rebuilds, undo, git reads and writes (on real temporary repositories), skill installation, update checks and the OpenRouter client (HTTP mocked). 80% line coverage.
- Mocks are used only at the edges: network, clock and randomness. Use real temporary folders and real git.

### End-to-end tests (Playwright with Electron)

- Each test launches the built app with a temporary data folder and a copy of a fixture project.
- `tools/fake-agent` plays the part of `/voidra-go`. It writes the files a skill would write, and makes the commit, from scripted scenarios. It tests the app's side of the loop, not the skills.
- Every screen gets an `@axe-core/playwright` accessibility check in light and dark themes, as the storylens dashboard does.

### Skills (no real agents in CI, D06)

- Each `SKILL.md` is linted: frontmatter, length and relative links.
- Every example output in a skill's references passes `voidra check`.
- Generated references (format and lifecycles) must be up to date.
- The implementing agent tries each skill headlessly in Claude Code and Codex with low-cost models (D17) and records the runs in the evidence file. The procedure is in the root `AGENTS.md`. P17 repeats the checks before release.

### Real-agent coverage matrix

Each row runs in both Claude Code and Codex using D17 and the root procedure. Runs occur locally, never in CI. Check file validity, allowed write paths, gate stops, exact approval revisions and commit behavior. Reuse a scenario across rows only when its recorded evidence exercises both behaviors explicitly.

| Phase | Skills or behavior | Required scenarios |
| --- | --- | --- |
| P03 | `voidra-go` v0 | Docs/chore, review rejection and follow-up commit |
| P04 | `voidra-init` | Existing-code intake, inferred answers, glossary and instruction pointer |
| P05 | `voidra-architect-general` | Discovery rounds, Bootstrap plan, seams, ADR proposal and slice split; invoke the architecture skill directly until P08 provides dispatch |
| P08 | `voidra-go`, `voidra-plan`, architecture dispatch | Feature, bug, improvement/refactor, Research, Profile change, Docs/chore, slices and human blockers; planning-only glossary update; stale approval blocks work; rejection returns each type to a valid stage |
| P12 | `voidra-release`, `voidra-sync`, Release in `voidra-go` | Release proposal through review and local tag; retry after commit/tag interruption; outside-code sync with a confirmed answer protected and a second sync that does not duplicate proposals |
| P17 | All five public skills and the architecture skill | Repeat the rows above on release-candidate skills; cover every action type and each skill's write restrictions, including approved plans changed before resumption |

### Fixture catalog

| Fixture | Contents |
| --- | --- |
| `empty-folder` | Nothing |
| `existing-code` | A small TypeScript app without `.voidra/` |
| `new-project` | A fresh minimal `.voidra/` in P01; P05 updates it from the shipped general template |
| `busy-project` | Every action type and stage, slices, blocked actions, actions done by you, assumptions and a release |
| `broken` | One invalid file of every kind |
| `newer-format` | A format version above the supported one |
| `conflicted` | Git conflict markers inside `.voidra/` files |
| `interrupted-run` | A persisted start record, unfinished operation and unchanged action stage; no completed result |
| `stale-approval` | Approved hashes followed by a content change in each of the three plan files |
| `large` | 1,000 actions, generated by a script and not committed |

### Continuous integration (GitHub Actions, macOS runner)

On every push and pull request: install, `make check` (lint, typecheck, unit tests with coverage, the deprecation scan and the generated-files check), build, then the end-to-end tests. Tags run the release workflow (P15).

## Requirement coverage

| VISION.md section | Phases |
| --- | --- |
| 3. Principles | P01 (format and invariants), P02 (runtime boundaries), every phase |
| 5. Main concepts | P01, P04, P06, P07, P11 |
| 6. Two ways in | P04, P05 |
| 7. Types, lifecycles, stages, slices, actions done by you | P01 (rules), P06 (app), P07 (gates), P08 (skills) |
| 8. Run loop, questions, commits, teams | P03, P07, P08, P09 |
| 9. Undo | P10 |
| 10. Skills, templates, format versions | P01, P03, P05, P08, P12, P14 |
| 11. AI inside the app | P13 |
| 12. The app in v1 | P02–P13 |
| 13. Layout and long-lived docs | P01, P11 |
| 14. v2 scope | P16 |
| 15. Technology | P00, P02, P15 |
| 16. Risks | P01 (validation), P08 (agent differences), P09 (conflicts), P12 (outside work), P17 |

## Definition of ready and done

- **Ready:** every phase it needs is Done, the open decisions that block it are answered, and every story has acceptance criteria.
- **Done:** every story meets its acceptance criteria. `make check` and the end-to-end tests pass locally and in CI, and coverage targets hold. Changed docs and `AGENTS.md` files are updated, the evidence file is written, the status is updated, and the work is committed with no undated deprecations.

## Changing a decision

When you answer an open question or change a decision, update the decision tables with the date, update the affected phase files and, if the product changes, update VISION.md in the same commit. A finished phase that is affected gets a follow-up story in a later phase rather than being reopened silently.

## Review corrections (2026-10-12)

This table maps the approved review to planned work. It records coverage, not completed implementation or verification evidence.

| Finding | Planned work |
| --- | --- |
| 1. Type-specific review transitions | P01-05, P07-04, P12-01 and P12-03; Research reworks in Discovery, Release reworks in Plan and is Released only after the agent completes the commit and tag |
| 2. Approval tied to exact contents | D21, P01-12, P07-06 and P08-10; compare hashes and require approval after any content change |
| 3. Undo during an active or interrupted run | P03-11 and P10-03; persist record consumption before work |
| 4. New files in planning commits | P09-03; stage only approved new `.voidra/` paths and preserve unrelated index entries |
| 5. Crash recovery and safe retries | P01-13, P03-11, P08-10, P12-07 and P15-08; atomic writes, checkpoints, ownership and side-effect reconciliation |
| 6. Missing setup references | D11 and P00-05 use the self-contained compatibility contract; P02 uses `apps/dashboard/design-system/MASTER.md` |
| 7. P07 prerequisite | P04 is required in the index and phase header; P07-05 tests inferred-profile confirmation |
| 8. Planning skill's glossary writes | D22 and P08-08 explicitly permit `GLOSSARY.md`; tests reject all other writes outside `.voidra/` |
| 9. Real-agent coverage | The real-agent matrix, P05-06, P08-09, P08-11, P12-08 and P17-05 cover every skill and representative lifecycle behavior |
