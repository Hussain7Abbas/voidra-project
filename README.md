# Voidra Project

[![CI](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml/badge.svg)](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml)

An open-source desktop app for planning and tracking software projects built with AI coding agents. Voidra keeps plans and progress in Markdown under `.voidra/`, while Claude Code or Codex implements actions through skills and human approval gates.

**Feature-complete preview.** The desktop supports profiles, all action types, question/approval gates, queue execution, a board, releases/Sync, searchable decisions, undo/redo, protected skill installation and optional editable OpenRouter suggestions. P15 is verifying distribution; final v1 release and human VoiceOver verification remain P17. See the [phase index](plan/main.md#phase-index) for actual progress.

- [Vision](VISION.md): product behavior and scope.
- [Implementation plan](plan/main.md): phases, decisions and verification evidence.
- [Documentation](docs/intro.md): development, compatibility and architecture.
- [Glossary](GLOSSARY.md): shared terms.
- [Agent instructions](AGENTS.md): the phase workflow and development rules.

## Install on macOS

Preview DMGs are published to [GitHub Releases](https://github.com/Hussain7Abbas/voidra-project/releases) when the release pipeline is verified. Use Apple Silicon (arm64), macOS 13 or newer. Open the DMG and copy **Voidra Project** into Applications.

The app is unsigned. On the first open, macOS may block it; use **System Settings → Privacy & Security → Open Anyway** after attempting to open the copied app, then confirm. Read [Apple’s guidance](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac). Updates are downloaded from the release page and installed by you; automatic checks can be disabled in Settings.

The public `voidra` baseline is still [0.1.0](https://www.npmjs.com/package/voidra/v/0.1.0) until trusted publication succeeds. Current developer/real-agent checks use the genuine locally packed matching candidate; no matching registry publication is claimed yet.

## Development

Use Node 24.13.0 and pnpm 10.30.3, then:

```sh
make setup
make check
```

`make help` lists the real targets. `make dev` opens the desktop; `make e2e`, `make package-dir` and `make smoke-packaged` verify it. [Development documentation](docs/development.md) covers pins, tests and coverage. To start a phase in Claude Code or Codex, ask it to run the next phase; the agent handles implementation, checks and GitHub work.

For skill development, `make skills-link PROJECT=/absolute/project` installs local links for both agents. Read [the runtime procedure](skills/voidra-go/references/runtime.md) before using the standalone skill; it requires an existing local Git repository.

## License

Voidra Project is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).
