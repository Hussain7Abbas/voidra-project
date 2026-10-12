# Development

[Documentation index](intro.md) · [Root instructions](../AGENTS.md)

## Setup and commands

Use Node **24.13.0** (`.node-version` / `.nvmrc`) and pnpm **10.30.3** (`packageManager` in `package.json`). Node's major matches Electron **44.7.0**, whose release metadata lists Node 24. Electron is a P02 dependency, not installed by P00. Its native modules still need Electron rebuilding and a packaged smoke test.

Run `make setup`, then `make check`. `make help` lists supported commands. The Makefile resolves its own root, so `make -f /absolute/path/to/voidra-project/Makefile check` also works from elsewhere. P00 has no environment-file consumer, dev server, desktop start command or deployment target; those commands are added when the corresponding capability exists.

`make check` runs Biome, `tsc -b`, Vitest with V8 coverage, and the deprecation scanner. `make build` compiles tooling into `.cache/typecheck/`; `make clean` removes that output and coverage reports. `make format` applies Biome formatting and safe fixes. `make test-watch` watches tests without the coverage run.

## Version pins

| Tool | Pin |
| --- | --- |
| Node | 24.13.0 |
| pnpm | 10.30.3 |
| TypeScript | 6.0.3 |
| Vitest and coverage-v8 | 5.0.4 |
| Biome | 2.5.15 |
| Node types | 24.19.2 |

TypeScript 6 supplies the stable compiler/parser API used by the scanner. TypeScript 7.0.2 was evaluated but exposes its programmatic API under unstable entry points, so it is not used here. Update exact pins and the lockfile together, then run the complete checks. Verify the Node major against the selected Electron release when P02 starts.

Sources: [Electron releases](https://releases.electronjs.org/), [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [Vitest coverage](https://vitest.dev/config/coverage), and [Biome configuration](https://biomejs.dev/reference/configuration/).

## Testing seams and coverage

The real workspace package is `tools/standards`. It has scanner parser/filesystem/CLI tests and temporary-project tests proving coverage enforcement. The temporary projects are deleted after each test and are never application or format-package placeholders.

| Scope | Minimum line coverage |
| --- | --- |
| `packages/voidra/src/**` | 90% |
| `apps/desktop/src/main/**` | 80% |
| `apps/desktop/src/project-service/**` | 80% |
| `tools/*/src/**` | 90% |
| UI components | No percentage target |

V8 includes unimported production files, so uncovered new code contributes to the gates. The coverage policy has no global percentage target that would accidentally impose one on UI components. Keep test locations under each workspace's `tests/` directory. P02 adds Electron end-to-end testing; real-agent checks remain local and begin in P03.

## Deprecation scan

`make deprecations` scans JavaScript and TypeScript source comments. The CLI also accepts `--root`, `--today YYYY-MM-DD`, `--json` and `--help`. Exit codes are 0 for a passing scan (including warnings), 1 for invalid/expired/undated markers, no scanned files or an I/O error, and 2 for bad arguments.

Discovery skips `.git`, `node_modules`, `.cache`, `coverage`, `dist`, test directories, fixtures, `*.test.*`, `*.spec.*`, declaration files and symlinks. Markdown examples and strings/template literals are not comment markers. A source file with no deprecated fields passes; a source file list of zero does not. See [compatibility](compatibility.md) for the marker contract and UTC deadline semantics.

## CI

The macOS workflow installs the pinned toolchain with a frozen lockfile and runs the same `make check` as local development. CI does not call Claude Code, Codex, OpenRouter or any real coding agent. It needs no personal token. Build and Electron end-to-end jobs are added in P02 when their harness exists.
