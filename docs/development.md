# Development

[Documentation index](intro.md) · [Root instructions](../AGENTS.md)

## Setup and commands

Use Node **24.13.0** (`.node-version` / `.nvmrc`) and pnpm **10.30.3** (`packageManager` in `package.json`). Node's major matches Electron **44.7.0**, whose release metadata lists Node 24. The desktop installs Electron; its packaged runtime is Node 24.21.0, ABI 149. Native modules need Electron rebuilding even though the Node majors match.

Run `make setup`, then `make check`. `make help` lists supported commands. The Makefile resolves its own root, so `make -f /absolute/path/to/voidra-project/Makefile check` also works from elsewhere. The desktop uses a static renderer with no server port; `make dev` starts the app.

`make check` builds the public format package before checking workspace imports, then runs Biome, strict workspace/renderer typechecking, Vitest with V8 coverage, the deprecation scanner and the generated-reference check. `make build` compiles tooling, the npm package and desktop renderer/process bundles; `make clean` removes that output, desktop packaging/test artifacts and coverage reports. `make format` applies Biome formatting and safe fixes. `make test-watch` watches tests without the coverage run.

## Version pins

| Tool | Pin |
| --- | --- |
| Node | 24.13.0 |
| pnpm | 10.30.3 |
| TypeScript | 6.0.3 |
| Vitest and coverage-v8 | 5.0.4 |
| Biome | 2.5.15 |
| Node types | 24.19.2 |

TypeScript 6 supplies the stable compiler/parser API used by the scanner. TypeScript 7.0.2 was evaluated but exposes its programmatic API under unstable entry points, so it is not used here. Update exact pins and the lockfile together, then run the complete checks. Verify the Node major and native ABI when updating Electron.

Sources: [Electron releases](https://releases.electronjs.org/), [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [Vitest coverage](https://vitest.dev/config/coverage), and [Biome configuration](https://biomejs.dev/reference/configuration/).

## Testing seams and coverage

The workspace members are `tools/standards`, `tools/run-engine`, `tools/fake-agent`, `tools/skills-distribution`, `tools/release-engine`, `packages/voidra` and `apps/desktop`. The standards package has scanner parser/filesystem/CLI tests and temporary-project tests proving coverage enforcement. The temporary projects are deleted after each test and are never application or format-package placeholders.

| Scope | Minimum line coverage |
| --- | --- |
| `packages/voidra/src/**` | 90% |
| `apps/desktop/src/main/**` | 80% |
| `apps/desktop/src/project-service/**` | 80% |
| `tools/*/src/**` | 90% |
| UI components | No percentage target |

V8 includes unimported production files, so uncovered new code contributes to the gates. The coverage policy has no global percentage target that would accidentally impose one on UI components. Keep test locations under each workspace's `tests/` directory. Electron end-to-end testing runs separately with `make e2e`; real-agent checks run locally, with their commands and outcomes in the phase evidence.

## Deprecation scan

`make deprecations` scans JavaScript and TypeScript source comments. The CLI also accepts `--root`, `--today YYYY-MM-DD`, `--json` and `--help`. Exit codes are 0 for a passing scan (including warnings), 1 for invalid/expired/undated markers, no scanned files or an I/O error, and 2 for bad arguments.

Discovery skips `.git`, `node_modules`, `.cache`, `coverage`, `dist`, test directories, fixtures, `*.test.*`, `*.spec.*`, declaration files and symlinks. Next output, e2e artifacts and desktop export/package paths are also excluded; ordinary production out/release directories remain scanned. Generated Go/Plan runtime, intake and general architecture bundles are excluded from skill source scanning; authored scripts remain scanned. Markdown examples and strings/template literals are not comment markers. A source file with no deprecated fields passes; a source file list of zero does not. See [compatibility](compatibility.md) for the marker contract and UTC deadline semantics.

## CI

The macOS CI workflow runs only when a tag with three numeric components prefixed by `v` is pushed, such as `v1.2.3` or `v12.30.4`. Branch pushes, pull requests, manual dispatch and tags such as `v1.2` or `v1.2.3-beta.1` do not start it. The quoted GitHub filter is `v[0-9]+.[0-9]+.[0-9]+`; each component contains one or more digits. See [GitHub's tag filter syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#filter-pattern-cheat-sheet). This starts the checks alongside the existing tag-driven Release workflow, before publication; it does not depend on a later GitHub Release event.

The workflow installs the pinned toolchain with a frozen lockfile and runs the same `make check` as local development. CI does not call Claude Code, Codex, OpenRouter or any real coding agent. It needs no personal token. CI also builds the package. Electron workflows, accessibility checks and an unsigned arm64 packaging/startup smoke run in CI. Run local checks before pushing ordinary source changes, which no longer start hosted CI. The separate Release and npm publication workflows retain their existing publication and recovery triggers.

## Format package development

`make test` builds the actual package before running its API, real-filesystem and built-CLI tests. Use `pnpm --filter voidra build` before a direct Vitest invocation that tests executable output. `pnpm gen` updates JSON Schema, docs and shared skill references; `pnpm gen:check` rejects missing, stale and orphan files. Generated JSON uses deterministic schema output and is excluded from Biome formatting so `make format` cannot make references stale. Do not edit it by hand.

`pnpm fixtures` deliberately rebuilds the committed catalog and its expected diagnostics. Review changed expectations. The `empty-folder` catalog entry has no project files; its test creates a truly empty directory. `new-project` contains minimal valid format data until P05 creates the real general-template output. `pnpm fixture:large /absolute/temporary/output` generates 1,000 actions; keep the output outside the repository. Local records in fixtures are explicitly tracked despite each fixture's `local/` ignore rule.

The format package uses zod 4.6.7 and yaml 2.9.1. See the [API contract](format/api.md), [CLI](format/cli.md) and [P01 evidence](verification/p01.md). The initial 0.1.0 publication used local authentication. Release publication now uses the explicitly dispatched exact-tag OIDC workflow after checked artifact staging; ordinary CI never publishes.

## Desktop development

`make setup` includes `make native`; SQLite must match Electron 44.7.0's ABI. `make dev` builds and opens the static exported renderer under the app protocol. `make check` generates Next route types before strict checking, builds native bundles and collects real Electron V8 coverage. `make e2e` checks the built app, keyboard workflows and axe in light/dark themes. `make package-dir` creates the unsigned Apple Silicon app directory; `make smoke-packaged` starts it with temporary app data and a real project utility process/SQLite connection. No server port is used.

Frontend build pins: Next 16.4.0, React 19.3.0, Tailwind/PostCSS 4.3.3, Inter Variable 5.3.0, Lucide 1.55.0, TanStack Query 5.104.2. Native/build pins: better-sqlite3 13.0.3, electron-builder 26.15.3, esbuild 0.28.2. Playwright is 1.64.0 and axe integration 4.13.0. Frontend dependencies are bundled build inputs, not unused runtime servers in the app.

The scanner excludes `.next`, e2e/results directories, and the desktop's exported/packaged output paths. Real source directories named out/release elsewhere remain scanned. Native tests selectively collect source-mapped Electron subprocess coverage; direct Node TS stripping has incompatible V8 offsets and remains covered at parent/API seams. UI has no line percentage requirement. Only OS chooser results are substituted in e2e tests; command-copy checks use the real Electron clipboard.

## Skills and run development

`make skills-link PROJECT=/absolute/project` creates project-local `.claude/skills` and `.agents/skills` links; omit PROJECT to use this checkout. It refuses conflicting contents. `make gen` builds the standalone run/intake runtimes, local format references and template copies and Apple Silicon process-identity helper; `make gen-check` rejects stale assets. The helper is compiled from repository-owned C using clang and macOS libproc, avoiding the setuid `ps` executable that agent sandboxes deny. Its source/flags hash is embedded; compiler bytes are not claimed reproducible across SDK versions. The arm64 helper is also unpacked in the desktop archive.

`make lint` checks skill metadata, length and relative resources. The shared run library and fake agent use real temporary Git repositories in tests. Unit/native tests run serially so the watcher timing assertion is not distorted by competing native builds. `make e2e` includes onboarding, profile editing/confirmation, create, queue, reject, rework, accept, invalid-output and explicit recovery workflows; CI never runs authenticated agents. See [run architecture](architecture/runs.md).

Run `make check` and desktop end-to-end suites sequentially. Quality tests also launch real Electron windows; separate temporary projects do not isolate desktop focus, clipboard or CPU contention. Overlapping suites are not valid timing evidence. Keep browser/account interaction separate from native UI verification.

The root development dependency links the current workspace `voidra` CLI. After `make check` or a package build, `npx --offline --yes voidra@1.0.0 version` and `npx --offline --yes voidra@1.0.0 check .` use the candidate for this repository’s dogfooding. The source now prepares the 1.0.0 candidate. Public npm next is the verified 0.2.2 preview; latest remains 0.1.0 until v1 publication. Real-agent temporary projects install the genuine freshly packed matching candidate archive, record its integrity and verify the exact offline version before running skills. Do not attempt Claude checks while the user-reported subscription is unavailable; record those final matrix rows as blocked.

Undo engine tests compile native fixture scripts with the same inline source-map convention as the desktop and run them with Electron's Node runtime. The coverage input includes only `.cache/undo-native-*/scenario.cjs` before remapping; production coverage gates are unchanged. Keep those ignored bundles until coverage reporting finishes; the next engine test run clears old bundles. Direct stripped-TypeScript subprocess coverage remains excluded.

CI allows 30 minutes for the expanded real-Git/native/Electron suite; the P12/P16 closure used over 18 minutes. Functional waits allow five seconds for review refresh and ten seconds for completed Release replay. The 105-write history-bound scenario alone allows 60 seconds for its native subprocess and 75 seconds for its test; other native subprocess limits remain 25 seconds. Assertions and coverage gates are unchanged. Authenticated agent checks still run only locally.

## Skill distribution

Settings installs offline bundled copies for Claude Code and Codex, protects hand edits with exact diff confirmation, and warns on written-format mismatches. `make skills-sync DRY_RUN=1` validates and previews an isolated public distribution clone; `SKILLS_REPO=/absolute/clone` selects a clean existing checkout. The real command publishes each validated skill through voidra-skills’ own rules, then shared templates/catalog updates. Use it during P17 releases after the matching library is published. See [architecture](architecture/skills-distribution.md) and [P14 evidence](verification/p14.md).

## Release preparation

`pnpm --filter voidra-project icon` regenerates PNG/ICNS from the reviewed SVG. `make package-dmg` builds without publishing; `node apps/desktop/scripts/dmg-smoke.ts` is run from the desktop workspace with the DMG path. `make release VERSION=X.Y.Z` requires clean committed source and matching notes, aligns app/library/reader/skill versions and exact check commands, rebuilds/regenerates, runs quality then the full desktop suite, tags/pushes and waits for separate GitHub/npm/skills checkpoints. `make release-finish VERSION=X.Y.Z` resumes verification/sync of an existing immutable tag. Original staged bytes are preserved; published mismatches stop. See [publication architecture](architecture/publication.md), [version ADR](adr/2026-10-14-release-versions.md) and [P15 evidence](verification/p15.md).
