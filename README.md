# Voidra Project

[![CI](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml/badge.svg)](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml)

An open-source desktop app for planning and tracking software projects built with AI coding agents. Voidra keeps plans and progress in Markdown under `.voidra/`, while Claude Code or Codex implements actions through skills and human approval gates.

**Voidra 1.1.1.** An agentic coding workspace with draggable Tasks, an ordered Actions sidebar, bottom approval/questions panel and resizable panes. Forms support rendered Markdown, Normal/Agentic capture, optional titles and private drafts. Team/client settings, searchable documentation and Xeploy-guided releases complete the workflow. All ten [workspace phases](plan-v1.1.0/main.md) are complete; [final evidence](docs/verification/v1.1.0-p10.md) records both-client checks, publication and downloaded-app verification.

- [Vision](VISION.md): product behavior and scope.
- [Workspace implementation plan](plan-v1.1.0/main.md): completed phases, decisions and verification evidence; [original v1 history](plan/main.md).
- [User guide](docs/user-guide.md): project setup, skills, questions, reviews, recovery and settings.
- [Documentation](docs/intro.md): development, compatibility and architecture.
- [Glossary](GLOSSARY.md): shared terms.
- [Agent instructions](AGENTS.md): the phase workflow and development rules.

## Install on macOS

The [1.1.1 DMG](https://github.com/Hussain7Abbas/voidra-project/releases/tag/v1.1.1) is the release download. Use Apple Silicon (arm64), macOS 13 or newer. Open the DMG and copy **Voidra Project** into Applications.

The app is unsigned. On the first open, macOS may block it; use **System Settings → Privacy & Security → Open Anyway** after attempting to open the copied app, then confirm. Read [Apple’s guidance](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac). Updates are downloaded from the release page and installed by you; automatic checks can be disabled in Settings.

Install the matching [voidra 1.1.1 library and CLI](https://www.npmjs.com/package/voidra/v/1.1.1) with `bun add voidra@1.1.1`. Publication uses CI provenance.

## Development

The [v1.1.0 plan](plan-v1.1.0/main.md) is complete and delivered as 1.1.1. Existing projects can review the task-tracking upgrade in Release settings; fresh projects enable it automatically. The original 1.1.0 tag is retained unchanged and unpublished. Performance measurements and remaining manual accessibility limits are recorded in [P10 evidence](docs/verification/v1.1.0-p10.md).

Use Node 24.13.0 and pnpm 10.30.3, then:

```sh
make setup
make check
```

`make help` lists the real targets. `make dev` opens the desktop; `make e2e`, `make package-dir` and `make smoke-packaged` verify it. [Development documentation](docs/development.md) covers pins, tests and coverage. To start a phase in Claude Code or Codex, ask it to run the next phase; the agent handles implementation, checks and GitHub work.

For skill development, `make skills-link PROJECT=/absolute/project` installs local links for both agents. Read [the runtime procedure](skills/voidra-go/references/runtime.md) before using the standalone skill; Discovery/Plan supports a new folder without Git. Approved Bootstrap initializes Git before implementation; existing projects must use their Git worktree root.

## License

Voidra Project is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).
