# Voidra Project

[![CI](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml/badge.svg)](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml)

An open-source desktop app for planning and tracking software projects built with AI coding agents. Voidra keeps plans and progress in Markdown under `.voidra/`, while Claude Code or Codex implements actions through skills and human approval gates.

**Voidra 1.0.0.** The desktop supports profiles, all action types, question/approval gates, queue execution, a board, releases/Sync, searchable decisions, undo/redo, protected skill installation and optional editable OpenRouter suggestions. P00–P17 are complete: regression, packaging, both-agent verification, the user-reported VoiceOver pass and live GitHub/npm/skills publication are verified. See the [phase index](plan/main.md#phase-index) for actual progress.

- [Vision](VISION.md): product behavior and scope.
- [Implementation plan](plan/main.md): phases, decisions and verification evidence.
- [User guide](docs/user-guide.md): project setup, skills, questions, reviews, recovery and settings.
- [Documentation](docs/intro.md): development, compatibility and architecture.
- [Glossary](GLOSSARY.md): shared terms.
- [Agent instructions](AGENTS.md): the phase workflow and development rules.

## Install on macOS

The [1.0.0 DMG](https://github.com/Hussain7Abbas/voidra-project/releases/tag/v1.0.0) is the release download. Use Apple Silicon (arm64), macOS 13 or newer. Open the DMG and copy **Voidra Project** into Applications.

The app is unsigned. On the first open, macOS may block it; use **System Settings → Privacy & Security → Open Anyway** after attempting to open the copied app, then confirm. Read [Apple’s guidance](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac). Updates are downloaded from the release page and installed by you; automatic checks can be disabled in Settings.

Install the matching [voidra 1.0.0 library and CLI](https://www.npmjs.com/package/voidra/v/1.0.0) with `npm install voidra@1.0.0`. Publication uses CI provenance.

## Development

The [v1.1.0 plan](plan-v1.1.0/main.md) tracks the Tasks-centered workspace redesign. The 1.1.1 development candidate includes release-aware draggable Tasks, shared Markdown editing, Team/client settings and reviewed capture with durable private form drafts. The right Actions sequence separates ordered work from safe execution requests; persistent resizable panes and bottom human gates are complete; Documentation directory/search and Xeploy-guided release preparation are complete; final compatibility and delivery checks are in progress. The published download remains 1.0.0; the initial 1.1.0 tag is retained unpublished after hosted shortcut-readiness checks.

Use Node 24.13.0 and pnpm 10.30.3, then:

```sh
make setup
make check
```

`make help` lists the real targets. `make dev` opens the desktop; `make e2e`, `make package-dir` and `make smoke-packaged` verify it. [Development documentation](docs/development.md) covers pins, tests and coverage. To start a phase in Claude Code or Codex, ask it to run the next phase; the agent handles implementation, checks and GitHub work.

For skill development, `make skills-link PROJECT=/absolute/project` installs local links for both agents. Read [the runtime procedure](skills/voidra-go/references/runtime.md) before using the standalone skill; Discovery/Plan supports a new folder without Git. Approved Bootstrap initializes Git before implementation; existing projects must use their Git worktree root.

## License

Voidra Project is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).
