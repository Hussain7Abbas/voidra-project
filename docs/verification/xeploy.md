# Xeploy release bump integration

Date: 2026-10-15. Post-v1 source follow-up; published versions and immutable tags are unchanged.

## Implementation

- Installed Xeploy 1.4.2 globally with Bun 1.3.6 and pinned the same package in `tools/release-engine`, using the existing pnpm 10.30.3 workspace and frozen lockfile. [Upstream](https://github.com/Hussain7Abbas/xeploy) exports the version-planning API used by the adapter.
- `make release-preview BUMP=patch|minor|major` uses Bun to print a stable version/tag without account access, writes, commits or tags. From the aligned 1.0.0 source, the respective results are 1.0.1, 1.1.0 and 2.0.0.
- `make release BUMP=…` resolves through the same Xeploy API, then runs the established alignment, notes, quality, desktop and immutable publication pipeline. The resolved VERSION is exported to the finishing coordinator. The adapter removes Xeploy's RC suffix for Voidra's stable release policy.
- Explicit VERSION requests remain supported independently of current alignment, allowing retries of older immutable tags. Conflicting VERSION/BUMP requests, unsupported bump kinds, invalid explicit versions, unsafe integer conversion and overflow stop before account access or writes. Retry an interrupted release with its exact VERSION rather than computing another bump.
- The interactive Xeploy publisher is not used: its direct commit/push/publication flow would bypass checked artifact staging. Existing GitHub/npm/skill publication checkpoints and CI tag filtering are retained.
- The user's global Bun preference is saved for Codex and Claude Code, preserving existing Claude instructions and its compatibility pointer. No npm command was used for this task. The existing registry OIDC publication contract is unchanged.

## Verification

- Release-engine suite: 15 tests across four files pass, including three new tests with real temporary files and Git. Checks cover all bump types, source/Git preservation, explicit-version retries with broken current alignment, invalid/ambiguous inputs and integer safety.
- Eight actual Bun/Make preview invocations pass: patch/minor/major, explicit version, conflicting inputs, unsupported RC, missing inputs and a prefixed explicit version. The complete source diff is identical before and after these commands.
- Full `make check` passes: lint, strict typing, 401 tests across 85 files, coverage gates, deprecation scan and generated-reference checks. The coverage test run took 392.67 seconds; the bump adapter has 100% line coverage.
- Desktop end-to-end/package smoke and live publication were not repeated for this tooling-only change. Hosted CI is intentionally tag-only; this ordinary source push will not start it.
- No new release was requested or published as part of installing this integration. Publication itself was not repeated; existing publication/recovery tests run in the release-engine suite.

## Interactive deployment target (2026-10-16)

At the user's request, `make deploy` now runs the standalone interactive Xeploy CLI with Bun from the repository root using `.xeploy.json`. It reuses an executable on PATH or installs `xeploy@1.4.2` globally with Bun and resolves Bun's global bin directory. The checked `make release` coordinator remains a separate entry point.

`make help` lists the target and `make -n deploy` parses successfully. Six disposable command probes passed: existing CLI reuse, missing CLI installation with a global directory outside PATH containing spaces, failed installation, failed global-bin lookup, propagated CLI failure, and missing Bun. The installed real CLI also returns `1.4.2` through Bun with `--version`. No actual deployment or publication was started; the full application suite was not repeated for this Makefile/docs change.
