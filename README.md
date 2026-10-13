# Voidra Project

[![CI](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml/badge.svg)](https://github.com/Hussain7Abbas/voidra-project/actions/workflows/ci.yml)

An open-source desktop app for planning and tracking software projects built with AI coding agents. Voidra keeps plans and progress in Markdown under `.voidra/`, while Claude Code or Codex implements actions through skills and human approval gates.

**Pre-alpha.** P00 establishes the repository tooling; P01 publishes the [`voidra` 0.1.0 format package and CLI](https://www.npmjs.com/package/voidra/v/0.1.0). P02 adds the secure desktop shell. P03 implements a Docs/chore loop: create and queue an action, run `/voidra-go` in Claude Code or `$voidra-go` in Codex, then accept or request changes in the app. P04 adds template-based onboarding, profiles and `voidra-init` for existing code. Other action types and the final general template arrive in the following phases. See the [phase index](plan/main.md#phase-index) for actual progress.

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

`make help` lists the real targets. `make dev` opens the desktop; `make e2e`, `make package-dir` and `make smoke-packaged` verify it. [Development documentation](docs/development.md) covers pins, tests and coverage. To start a phase in Claude Code or Codex, ask it to run the next phase; the agent handles implementation, checks and GitHub work.

For skill development, `make skills-link PROJECT=/absolute/project` installs local links for both agents. Read [the runtime procedure](skills/voidra-go/references/runtime.md) before using the pre-alpha skill; it requires an existing local Git repository.

## License

Voidra Project is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).
