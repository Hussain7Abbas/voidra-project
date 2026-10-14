# Voidra Project

Voidra Project is an open-source desktop app for planning and tracking software projects built with AI coding agents. [VISION.md](VISION.md) defines what it is. [plan/main.md](plan/main.md) tracks implementation. [docs/intro.md](docs/intro.md) is the documentation entry point. P00 tooling and the published P01 format package/CLI are complete; P02 desktop shell is complete; P03 is complete and M1 proves the Docs/chore tracer bullet; P04 is complete with onboarding and the project profile; P05 is complete with the general template and architecture skill under the delegated review recorded in D24. P06 is complete with backlog, all action types, dependencies, human checklists and the board. P07 is complete with questions, exact plan/review decisions and the inbox. P08 is complete with standalone Go/Plan execution, real-agent evidence for all implementation types, Research, human blockers, slices and planning-only restrictions. P09 is complete with daily-use run ordering, commit history, planning commits, teams and this repository’s own `.voidra/`; M2 is reached. P10 is complete with persistent undo and redo, durable consumption blocking, overwrite confirmation and native menus. P11 is complete with searchable decisions/assumptions, source-linked revisits, a read-only glossary/docs viewer and ADR/glossary skill examples. P12 is complete with local Release planning, commit/tag recovery, Sync and real-agent evidence. P13 implements optional encrypted AI suggestions and is completing verification. P16 is complete with reviewed v2 architecture documents; no v2 code is implemented.

## Structure and shared rules

- `apps/desktop/`: secure Electron shell, static Next renderer, bridge, utility services and native/e2e/package tests; follow its [local instructions](apps/desktop/AGENTS.md).
- `packages/voidra/`: shared format, lifecycles, CLI, safe writes, fixtures and schema generation; follow its [local instructions](packages/voidra/AGENTS.md).
- `fixtures/`: committed validation catalog; large output is generated into temporary folders.
- `templates/`: bundled, validated profile questions; follow its [local instructions](templates/AGENTS.md). The general 1.0.0 template has delegated P05 approval; see its review evidence.
- `skills/`: executable skills and self-contained generated references; follow its [local instructions](skills/AGENTS.md).
- `tools/run-engine/`: standalone run ownership, durable Git recovery, skill linking and artifact generation. Follow its [local instructions](tools/run-engine/AGENTS.md).
- `tools/fake-agent/`: scripted local agent scenarios for deterministic CI workflow checks.
- `tools/standards/`: repository checks, coverage policy and their Vitest tests. Follow its [local instructions](tools/standards/AGENTS.md).
- `docs/`: development, compatibility, architecture, ADRs and verification evidence; `docs/architecture/v2/` holds source-linked future designs governed by its [local instructions](docs/architecture/v2/AGENTS.md). Start at [the index](docs/intro.md).
- `plan/`: phase requirements and status, governed by [its instructions](plan/AGENTS.md). The vision wins over the plan.
- `.github/workflows/ci.yml`: the macOS frozen-install and `make check` pipeline. CI never runs authenticated coding agents.
- Root config: pinned pnpm and Node, strict TypeScript, Biome, Vitest and the Makefile. Native Electron modules still require Electron-specific rebuilding in P02; matching Node major versions alone is insufficient.
- Future app, executable skill and template directories are created when their phases give them real content. Do not add placeholders or implement later-phase scope early.
- Use ESM TypeScript with erasable syntax, explicit types at public boundaries, and explicit `.ts` extensions for local source imports. TypeScript rewrites those extensions in generated output. Naming and formatting follow Biome and `tsconfig.base.json`; do not add parallel formatting rules.
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
| `make dev` | Build and open the desktop app |
| `make native` | Rebuild native modules for Electron |
| `make e2e` | Electron workflow and accessibility checks |
| `make package-dir` / `make smoke-packaged` | Package unsigned arm64 app / verify startup and SQLite |
| `make clean` | Remove build, package, test and coverage output |

## Working with the user

- Put decision questions directly in the chat, with lettered options (`a`, `b`, `c`, …), brief tradeoffs and a recommendation where useful. Do not rely on selectable question cards: the user cannot see them.
- Label each question **Choose one** or **Choose any that apply**. Always allow a free-text answer.
- Record accepted product decisions in the plan and vision together. Routine implementation details may be resolved within the scope the user authorized; do not present those details as separate user answers.

## Documentation maintenance

As part of every task, keep project instructions and documentation synchronized with user-requested changes and relevant changes already made by the user. Before finishing, review the affected `AGENTS.md` files and `docs/` pages and update any rules, directory descriptions, code conventions, commands, architecture, interfaces, configuration or behavior that changed. Add, move or remove scoped instructions and documentation when scopes change, and repair their indexes and links. Update affected documentation in the same task as code changes; do not leave stale guidance. Preserve unrelated user edits and document the intended state without reverting code to match old documentation. If a change has no documentation or instruction impact, leave those files unchanged. Keep every `CLAUDE.md` containing only `@AGENTS.md` with a trailing newline, with the rules in its sibling `AGENTS.md`. Do not create empty documentation or application placeholders ahead of their phase.

## Running plan phases

When the user asks to run the next phase, to continue, or to run a specific phase (for example "run P03"):

1. **Pick the phase.** "Next" means the phase marked **In progress** in `plan/main.md`; otherwise the first **Not started** phase whose needs are all **Done**. If no phase can start, say why and stop.
2. **Read** this file, `VISION.md`, `plan/main.md`, `plan/AGENTS.md`, the phase file, and the evidence files (`docs/verification/`) of the phases it needs.
3. **Check your understanding.** Reply with the stories you will implement, the files you expect to create or change, the testing seams you will test at, any risks or contradictions, and your questions. Then stop and wait for the user's go-ahead, unless the user has explicitly authorized continuing through all phases. Under that authorization, report each phase's understanding in commentary and continue; resolve named product approvals when the user expressly delegates them (D24), recording the rationale. Stop only for required account access or checks that cannot be performed by the agent.
4. **Implement.** Set the phase to **In progress** in `plan/main.md`. Work story by story, writing tests at the agreed seams first. Once P00 has created the Makefile, run `make check` after each story.
5. **Do every step yourself.** That includes all GitHub work with the `gh` CLI and the real-agent checks described below. Ask the user only for decisions, for the approvals the phase names, and for anything that needs their accounts. Never ask the user to copy or paste anything.
6. **Finish.** When every exit criterion is met:
   - write `docs/verification/pXX.md`;
   - update the docs and `AGENTS.md` files that changed;
   - set the phase to **Done** with the date in `plan/main.md`;
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

Until P15 publishes the matching library, build and pack the current `voidra` candidate, install that genuine archive into each temporary fixture with `npm install --no-save --package-lock=false --ignore-scripts <archive>`, and verify `npx --offline --yes voidra@0 version` resolves the candidate. Ignore `node_modules/` before setup commits and include its prepared state in the allowed fixture tooling. This is the actual CLI, not a mock; record archive integrity and version in evidence. npm 0.1.0 remains the public baseline until trusted publishing.

Use the real-agent coverage matrix in [plan/main.md](plan/main.md#real-agent-coverage-matrix) to select scenarios. Snapshot files and git history before each run, then check allowed write paths, gate stops and commit trailers as well as file validity. A fake-agent run or a valid golden example never substitutes for these checks.

<!-- Voidra planning -->
## Voidra planning

Read [.voidra/README.md](.voidra/README.md), the project profile and action before work. Respect the question, exact-content plan and review gates. Use the Voidra skills for tracked work, and run `npx voidra@0 check` after planning writes.
