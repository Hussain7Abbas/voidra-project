# Voidra Project

[![CI](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml/badge.svg)](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml)

An open-source desktop app for planning and tracking software projects built with AI coding agents. Voidra keeps plans and progress in Markdown under `.voidra/`, while Claude Code or Codex implements actions through skills and human approval gates.

**Pre-alpha.** P00 establishes the repository tooling; P01 implements the `voidra` format package and CLI (publication status is in its evidence). The desktop app and executable agent skills arrive in later phases. See the [phase index](plan/main.md#phase-index) for actual progress.

- [Vision](VISION.md): product behavior and scope.
- [Implementation plan](plan/main.md): phases, decisions and verification evidence.
- [Documentation](docs/intro.md): development, compatibility and architecture.
- [Glossary](GLOSSARY.md): shared terms.
- [Agent instructions](AGENTS.md): the phase workflow and development rules.

## Development

Use Node 24.13.0 and pnpm 10.30.3, then:

```sh
make setup
make check
```

`make help` lists the real targets. There is no desktop development or release command until its phase is built. [Development documentation](docs/development.md) covers pins, tests and coverage. To start a phase in Claude Code or Codex, ask it to run the next phase; the agent handles implementation, checks and GitHub work.

## License

Voidra Project is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).
