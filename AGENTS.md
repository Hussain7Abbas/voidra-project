# Voidra Project

Voidra Project is an open-source desktop app for planning and tracking software projects built with AI coding agents. [VISION.md](VISION.md) defines what it is. [plan/main.md](plan/main.md) tracks implementation. [docs/intro.md](docs/intro.md) is the documentation entry point. P00 tooling and the published P01 format package/CLI are complete; P02 desktop shell is complete; P03 is complete and M1 proves the Docs/chore tracer bullet; P04 is complete with onboarding and the project profile; P05 is complete with the general template and architecture skill under the delegated review recorded in D24. P06 is complete with backlog, all action types, dependencies, human checklists and the board. P07 is complete with questions, exact plan/review decisions and the inbox. P08 is complete with standalone Go/Plan execution, real-agent evidence for all implementation types, Research, human blockers, slices and planning-only restrictions. P09 is complete with daily-use run ordering, commit history, planning commits, teams and this repository’s own `.voidra/`; M2 is reached. P10 is complete with persistent undo and redo, durable consumption blocking, overwrite confirmation and native menus. P11 is complete with searchable decisions/assumptions, source-linked revisits, a read-only glossary/docs viewer and ADR/glossary skill examples. P12 is complete with local Release planning, commit/tag recovery, Sync and real-agent evidence. P13 is complete with optional encrypted AI suggestions, exact privacy previews, editable drafts and verified error handling. P14 is complete with offline skill installation, exact edit protection, compatibility and checked distribution sync; M3 is reached. P16 is complete with reviewed v2 architecture documents; no v2 code is implemented. P15 is complete with the retained 0.2.2 distribution/recovery pipeline; P17 is complete and M4 is reached: v1.0.0 ships on GitHub/npm with exact public skills, full both-agent evidence, user-reported VoiceOver in both themes and the verified actual downloaded app. Bootstrap first-commit cloning and CLI help are corrected. act-n2ey21 tracks an intermittent hosted CI refresh assertion; the immutable source passes full local/CI and release checks. No v2 code is implemented.

## Structure and shared rules

- `apps/desktop/`: secure Electron shell, static Next renderer, bridge, utility services and native/e2e/package tests; follow its [local instructions](apps/desktop/AGENTS.md).
- `packages/voidra/`: shared format, lifecycles, CLI, safe writes, fixtures and schema generation; follow its [local instructions](packages/voidra/AGENTS.md).
- `fixtures/`: committed validation catalog; large output is generated into temporary folders.
- `templates/`: bundled, validated profile questions; follow its [local instructions](templates/AGENTS.md). The general 1.0.0 template has delegated P05 approval; see its review evidence.
- `skills/`: executable skills and self-contained generated references; follow its [local instructions](skills/AGENTS.md).
- `tools/run-engine/`: standalone run ownership, durable root/submodule Git recovery, matching offline skill validation, skill linking and artifact generation. Follow its [local instructions](tools/run-engine/AGENTS.md).
- `tools/release-engine/`: version alignment, staged checksums, immutable publication recovery and OIDC provenance checks. Follow its [local instructions](tools/release-engine/AGENTS.md).
- `tools/skills-distribution/`: checked release copies, isolated dry runs and the distribution repository’s own publishing rules. Follow its [local instructions](tools/skills-distribution/AGENTS.md).
- `tools/fake-agent/`: scripted local agent scenarios for deterministic CI workflow checks.
- `tools/release-engine/`: Xeploy version-bump planning, aligned release preparation and immutable GitHub/npm publication recovery; follow its [local instructions](tools/release-engine/AGENTS.md).
- `tools/standards/`: repository checks, coverage policy and their Vitest tests. Follow its [local instructions](tools/standards/AGENTS.md).
- `docs/`: development, compatibility, architecture, ADRs and verification evidence; `docs/architecture/v2/` holds source-linked future designs governed by its [local instructions](docs/architecture/v2/AGENTS.md). Start at [the index](docs/intro.md).
- `plan/`: phase requirements and status, governed by [its instructions](plan/AGENTS.md). The vision wins over the plan.
- `plan-v1.2.0/`: current six-column workflow, owned QA/security, selected-client opening and documentation/navigation refinement; see its [tracker](plan-v1.2.0/main.md). All five slices are complete with 491 quality tests, 104 desktop scenarios, both actual clients and packaged verification in [evidence](docs/verification/task-workflow.md). Desktop 1.2.1 and format/skills 1.2.0 are development source; published 1.1.1 remains immutable. The first-launch follow-up adds persistent theme/client selection and selected-bundle installation before entering an unconfigured workspace; internal AI now uses the selected headless CLI with per-agent model/effort controls in setup and Settings; see [onboarding](docs/architecture/onboarding.md). The meta-repository follow-up adds recoverable initialized/nested submodule commits and matching offline skill validators; [verification](docs/verification/meta-repos.md) records 525 passing quality tests and both actual clients, including the Claude default-model retry. Monorepo release discovery searches contained folders for the highest numeric package version, with a native folder selector in Releases; Profile is last in primary navigation. See [Tasks architecture](docs/architecture/tasks.md).
- `plan-v1.1.0/`: Tasks/Kanban workspace implementation plan, with its own [tracker](plan-v1.1.0/main.md) and [instructions](plan-v1.1.0/AGENTS.md). The user authorized starting implementation on 2026-10-15; V11-P01–P09 are complete with a Tasks projection, release-source selection, explicit migration, guarded movement, shared Markdown editing, local Team/Me, selected-client guidance and two complete-bundle installers. V11-P04 adds reviewed Normal/Agentic capture and durable private drafts across forms. V11-P05 adds pointer/keyboard Kanban and release filters; V11-P06 adds global Actions intent, dependency warnings/repair and safe first-eligible standalone execution. V11-P07 adds persistent resizable/toggleable sidebars and bottom gates, attention/draft continuity and titlebar history; M11-2 is reached. V11-P08 adds complete Markdown knowledge views and a searchable full-page Documentation workspace; V11-P09 adds Xeploy-guided release drafts, exact Done-ticket version choices and recoverable standalone finalization, verified by both real clients and the packaged app; V11-P10 is complete with fresh tracked initialization, on-demand indexing, live Undo/replay reconciliation protection, 483 quality tests, 102 desktop scenarios, both actual coding clients and public downloaded-app verification. M11-3 is reached: 1.1.1 is published on GitHub/npm with exact tagged skill copies. The initial 1.1.0 tag is retained unchanged and unpublished after hosted shortcut-readiness checks. See [P10 evidence](docs/verification/v1.1.0-p10.md) for recovery and the unmet 2-second cold-open target/manual VoiceOver limits. Preserve completed v1 phase history. The product direction is recorded in [VISION.md section 17](VISION.md#17-v110-product-direction); the original v1 delegation is not blanket approval for these phases. The user separately authorized completing all v1.1.0 phases non-stop; report phase understanding and continue within that authorization.
- `.github/workflows/ci.yml`: tag-only quality, desktop and packaging gates for pushed `vX.Y.Z` tags with three numeric components. CI and Release call `.github/workflows/verify.yml`: one quality/build job, three exclusive macOS desktop shards and a required merged-report gate. The checked build is reused for desktop tests and packaging. Branch pushes, pull requests and manual dispatch do not start CI. CI never runs authenticated coding agents.
- Root config: pinned pnpm and Node, strict TypeScript, Biome, Vitest and the Makefile. Native Electron modules still require Electron-specific rebuilding in P02; matching Node major versions alone is insufficient.
- Future app, executable skill and template directories are created when their phases give them real content. Do not add placeholders or implement later-phase scope early.
- Use ESM TypeScript with erasable syntax, explicit types at public boundaries, and explicit `.ts` extensions for local source imports. TypeScript rewrites those extensions in generated output. Naming and formatting follow Biome and `tsconfig.base.json`; do not add parallel formatting rules.
- Vitest runs isolated files in two fork workers, then the exclusive native/toolchain group with one worker; `sequence.groupOrder` prevents group overlap. Register new Electron/native-coverage tests in `exclusiveTestFiles` in `vitest.config.ts`. Keep coverage aggregation and thresholds at the root. Desktop shards may overlap only on separate OS runners.
- Put tests under the owning workspace's `tests/` directory and check behavior at public boundaries. Use real temporary files and git; mock only external services, time and randomness. Keep temporary projects and generated files out of commits.
- Preserve the AGPL-3.0-or-later license and existing instruction sections. GitHub work uses the Hussain7Abbas account's existing authentication without changing the active `gh` account; this repository uses HTTPS after the approved SSH fallback.

## Commands

Use Node from `.node-version` or `.nvmrc` and the exact pnpm version in `package.json`. See [development](docs/development.md) for pins, coverage and exclusions.

| Command | Purpose |
| --- | --- |
| `make setup` / `make install` | Frozen install; setup also rebuilds SQLite for Electron |
| `make help` | List the real commands |
| `make check` | Lint, strict typecheck, coverage tests, deprecations and generated-reference check |
| `make format` | Apply Biome formatting and safe fixes |
| `make build` | Compile tooling, format package and desktop into ignored output |
| `make test` / `make test-watch` | Run coverage-gated tests / watch tests |
| `make deprecations` | List markers and fail on invalid deadlines or an empty scan |
| `make gen` / `make gen-check` | Generate schemas, references and skill runtime / reject stale output |
| `make skills-link PROJECT=/absolute/project` | Link skills into project Claude Code and Codex folders |
| `make skills-sync DRY_RUN=1` / `make skills-sync` | Preview / validate and publish release skill copies; optional SKILLS_REPO selects a clone |
| `make dev` | Build and open the desktop app |
| `make native` | Rebuild native modules for Electron |
| `make e2e` | Background Electron workflow/accessibility checks; `VOIDRA_TEST_BACKGROUND=0 make e2e` includes visible native window checks |
| `make package-dmg` | Build the unsigned Apple Silicon DMG without publishing |
| `make release VERSION=X.Y.Z` | Align, rebuild/generate, pass quality and desktop checks before tagging, then publish with recovery |
| `make release-finish VERSION=X.Y.Z` | Resume verification and remaining publication checkpoints for an existing immutable tag |
| `make package-dir` / `make smoke-packaged` | Package unsigned arm64 app / verify startup and SQLite |
| `make release-preview BUMP=patch` | Preview a Xeploy patch/minor/major bump without changing files or Git; requires Bun |
| `make deploy` | Run interactive Xeploy with Bun using `.xeploy.json`; install Xeploy 1.4.2 globally if missing |
| `make release BUMP=patch` / `make release VERSION=X.Y.Z` | Prepare and publish through the checked release pipeline; use an explicit version for retries |
| `make clean` | Remove build, package, test and coverage output |

## Working with the user

- Put decision questions directly in the chat, with lettered options (`a`, `b`, `c`, …), brief tradeoffs and a recommendation where useful. Do not rely on selectable question cards: the user cannot see them.
- Label each question **Choose one** or **Choose any that apply**. Always allow a free-text answer.
- Record accepted product decisions in the plan and vision together. Routine implementation details may be resolved within the scope the user authorized; do not present those details as separate user answers.

## Documentation maintenance

As part of every task, keep project instructions and documentation synchronized with user-requested changes and relevant changes already made by the user. Before finishing, review the affected `AGENTS.md` files and `docs/` pages and update any rules, directory descriptions, code conventions, commands, architecture, interfaces, configuration or behavior that changed. Add, move or remove scoped instructions and documentation when scopes change, and repair their indexes and links. Update affected documentation in the same task as code changes; do not leave stale guidance. Preserve unrelated user edits and document the intended state without reverting code to match old documentation. If a change has no documentation or instruction impact, leave those files unchanged. Keep every `CLAUDE.md` containing only `@AGENTS.md` with a trailing newline, with the rules in its sibling `AGENTS.md`. Do not create empty documentation or application placeholders ahead of their phase.

## Running plan phases

When the user asks to run the next phase, to continue, or to run a specific phase (for example "run P03"):

1. **Pick the phase.** Use the tracker for the release the user names. For the newly requested workspace work, use `plan-v1.1.0/main.md` and IDs `V11-PXX`; unqualified "next" now refers to that tracker. "Next" means the phase marked **In progress**; otherwise the first **Not started** phase whose needs are all **Done**. Explicit original `P00`–`P17` requests still refer to `plan/main.md`. If no phase can start, say why and stop.
2. **Read** this file, `VISION.md`, the selected tracker and its directory's `AGENTS.md`, the phase file, and the evidence files (`docs/verification/`) of the phases it needs.
3. **Check your understanding.** Reply with the stories you will implement, the files you expect to create or change, the testing seams you will test at, any risks or contradictions, and your questions. Then stop and wait for the user's go-ahead, unless the user has explicitly authorized continuing through all phases. Under that authorization, report each phase's understanding in commentary and continue; resolve named product approvals when the user expressly delegates them (D24), recording the rationale. Stop only for required account access or checks that cannot be performed by the agent.
4. **Implement.** Set the phase to **In progress** in its selected tracker. Work story by story, writing tests at the agreed seams first. Once P00 has created the Makefile, run `make check` after each story.
5. **Do every step yourself.** That includes all GitHub work with the `gh` CLI and the real-agent checks described below. Ask the user only for decisions, for the approvals the phase names, and for anything that needs their accounts. Never ask the user to copy or paste anything.
6. **Finish.** When every exit criterion is met:
   - write `docs/verification/pXX.md` for the original plan, or `docs/verification/v1.1.0-pXX.md` for v1.1.0;
   - update the docs and `AGENTS.md` files that changed;
   - set the phase to **Done** with the date in its selected tracker;
   - commit and push.
7. **Report** what was done, anything unverified and why, and which phase is next.

## Real-agent checks

When a story asks for a skill to be tried with real agents, run the check yourself, headlessly and locally (never in CI):

1. Copy a fixture project into a temporary folder and make it a git repository.
2. Make this repository's skills available to both agents (`make skills-link`, from P03 on).
3. Run the skill with `claude -p` using Haiku and with `codex exec` using Luna, both at low reasoning effort (decision D17 in `plan/main.md`). Check each CLI's `--help` for its model, effort and permission options. Limit the agent's write access to the temporary folder.
4. Run `voidra check` on the result and inspect what the agent wrote and committed.
5. If a step fails, rerun it with that agent's default model. A failure with both models is a skill problem: fix it. A failure only with the small model is a model limit: record it.
6. Record the commands, model IDs, effort settings and results in the phase's evidence file.

For release-candidate checks, build and pack the current matching `voidra` candidate, install that genuine archive into each temporary fixture with `npm install --no-save --package-lock=false --ignore-scripts <archive>`, and verify `npx --offline --yes voidra@<candidate version> version` resolves the candidate. Ignore `node_modules/` before setup commits and include its prepared state in the allowed fixture tooling. This is the actual CLI, not a mock; record archive integrity and version in evidence. Trusted npm publishing is verified: 1.1.1 is public on `latest`; the retained 0.2.2 preview remains on `next`.

Use the real-agent coverage matrix in [plan/main.md](plan/main.md#real-agent-coverage-matrix) to select scenarios. Snapshot files and git history before each run, then check allowed write paths, gate stops and commit trailers as well as file validity. A fake-agent run or a valid golden example never substitutes for these checks.

<!-- Voidra planning -->
## Voidra planning

Read [.voidra/README.md](.voidra/README.md), the project profile and action before work. Respect the question, exact-content plan and review gates. Use the Voidra skills for tracked work, and run `npx --offline --yes voidra@1.0.0 check` after planning writes.
