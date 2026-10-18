# Repository standards tooling

These rules extend the [root instructions](../../AGENTS.md).

- `src/coverage-policy.ts` defines the coverage gates shared by Vitest and the temporary enforcement probes. Root Vitest projects aggregate coverage once across isolated and exclusive native/toolchain groups. Coverage probes explicitly clear inherited projects so they still test their own fixture.
- `tests/test-scheduling.test.ts` exercises actual parallel overlap, exclusive native execution after the parallel group and combined coverage using disposable Vitest fixtures. It also guards new Electron/native-coverage imports against accidental parallel scheduling.
- `src/deprecations.ts` exposes comment parsing, source discovery and CLI behavior. `src/deprecations-cli.ts` is the executable adapter; Node runs its erasable TypeScript directly.
- `tests/` checks the public behavior on real temporary projects. Cleanup every fixture; fixture dates are explicit UTC dates. Source snippets live in strings so repository scanning cannot mistake them for real deprecated APIs.
- Use TypeScript's parser for comment boundaries; never search raw source with a marker regex alone. Ignore dependencies, generated code (including each skill’s matching `scripts/voidra.mjs` validator, Next output and scoped desktop exports/packages), declaration files, tests and fixtures during production-source discovery. An empty file is a scanned file; an empty set of files is an error.
- The deprecation scanner is read-only. It must not alter source, git, deadlines or migration data.
- Run `make check` from the repository root, or `make -f /absolute/path/to/Makefile check` from another directory. The root scripts run all workspace suites and enforce coverage.
- Keep these instructions, [development documentation](../../docs/development.md) and [compatibility policy](../../docs/compatibility.md) current whenever this tool's behavior or structure changes, following the root maintenance rule.
