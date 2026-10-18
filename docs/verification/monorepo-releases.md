# Monorepo release sources and navigation

Direct source follow-up requested on 2026-10-18. The current release comes from the highest package version found under the project or a saved contained folder; existing exact package selections remain exact. Releases owns Release settings and the explicit task-tracking upgrade. Primary navigation is Tasks, Documentation, Releases, Profile.

Discovery searches app/apps/packages and arbitrary subfolders, uses numeric components and prerelease precedence, excludes dependencies/generated/test/fixture trees and packaged apps, and refuses symlink paths. Eight directory levels, 10,000 entries and 256 KiB per manifest bound reads; exhaustion returns an actionable notice instead of a partial winner. Folder selection stores guarded, undoable metadata with the current winner as an older-reader fallback. Live discovery never rewrites tickets or package files. Task creation, initialization, migration and release preparation use the same rule; another manifest overtaking the source invalidates an old release proposal.

## Real coding clients

Both clients ran the installed `voidra-init` skill and its generated intake helper in separate temporary Git fixtures, then used the generated Go runtime's read-only `release-options`. Root version 0.0.0, app/web 2.9.0 and products/api 2.10.0 selected **products/api/package.json 2.10.0**, with patch **2.10.1**, minor **2.11.0** and major **3.0.0**. The actual packed local format candidate was installed with Bun; `bun run voidra version` confirmed 1.2.0 and `bun run voidra check .` passed after intake. Its SHA-512 integrity is `EodVdVpXhkZs+l+tlWjCYxfDj6J8CYMWVwOdyfyVclEiyW5fKpyeTxc2VQPAN/PSoXIs1ImAk9l3GhYayC4kNw==`.

- Claude Code: `claude -p`, model `claude-haiku-4-5`, `--effort low --permission-mode dontAsk --tools Bash,Read --allowedTools Bash,Read --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' --no-session-persistence --output-format json`. A whole-process macOS write boundary restricted writes to its temporary fixture parent and `/dev/null`; positive/negative probes passed. The initial invocation encountered an expired OAuth session; a normal no-tools CLI probe refreshed the existing session, then the same small model passed. No account switch occurred.
- Codex: `codex exec --cd <fixture> --ephemeral --ignore-user-config --ignore-rules -m gpt-6-luna --sandbox workspace-write --add-dir <temporary parent> --add-dir <fixture>/.git -c 'approval_policy="never"' -c 'model_reasoning_effort="low"' -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' -c 'sandbox_workspace_write.exclude_slash_tmp=true' --json`. The small model passed without a model fallback.

Before/after file and Git audits confirm valid source-linked inferred profiles, only allowed intake/instruction/glossary writes, preserved source/manifests, unchanged HEAD, no tags and no Bootstrap/actions/implementation. Commands, CLI help, archive integrity, private output and audits remain in ignored `.cache/monorepo-real/`. This repository's own `.voidra/` is unchanged. These checks do not publish anything or claim a manual screen-reader pass.

## Source and native verification

The full `make check` attempt completed **512 tests: 509 passed, three failed** (`.cache/monorepo-check-final.log`). Two existing run-engine cases (Sync and owned QA) exceeded their unchanged 30-second limits. The third exposed an existing version split: committed desktop/root metadata was 1.2.1 while the library was 1.2.0, and minimal app creation incorrectly used the library version in its creator label. The utility build now injects the desktop package version for that label; reader and validation versions remain the library's version. No package versions were changed.

After the correction, **27/27 focused tests in five files** pass (`.cache/monorepo-focused.log`): project release discovery, release preparation, task tracking, Sync and owned QA. This includes both timeout cases, run serially with `--maxWorkers=1` and their original deadlines, plus discovery exclusions/bounds, unsafe selections, prerelease ordering, new-task defaults and competing-manifest invalidation. The existing actual Electron creation regression separately passes **1/1** with the correct creator label (`.cache/monorepo-create.log`).

The desktop build and `make lint typecheck deprecations gen-check` pass (`.cache/monorepo-desktop-build.log`, `.cache/monorepo-static.log`); `bun run voidra check .` validates this repository's unchanged planning data. The complete coverage suite was not rerun after the creator-label correction, so this evidence does not claim a fresh all-green `make check` or coverage gate.

## Electron and visual verification

**7/7 actual Electron scenarios pass** in `.cache/monorepo-e2e.log` (2.1 minutes), using one worker and disposable projects:

- Folder discovery/selection in light and dark, native chooser cancellation, refusal of a folder outside the project, guarded save, persistent Undo/Redo, a competing package becoming the maximum, discovery of a newly created package, restart persistence, no release settings on Tasks, and exact Profile-last navigation.
- Existing Tasks scenarios in both themes, including exact package selection, external version updates, explicit migration/undo/redo, preserved assignments and missing-release defaults after movement.
- Existing release-wizard scenarios in both themes, including saved partial steps and refusal of a stale package source.
- Release settings draft storage failure, keyboard disclosure close refusal, recovery and restart restoration on its new Releases page.

Axe reports no violations for the new release-source scenarios and the retained Tasks/wizard checks. Narrow 1000×700 light/dark screenshots and normal restarted-window screenshots were inspected (`/tmp/voidra-release-source-{light,dark}[-narrow].png`): the source controls retain independent main-area scrolling, the winning package is visible, Release settings is on Releases, and Profile is last. The OS chooser alone is substituted; files, IPC, undo, utility processes and persistence are real. Manual VoiceOver, visible native-window controls and a fresh packaged-app build are not newly claimed.

Subsequent [meta-repository verification](meta-repos.md) passes the complete 525-test quality suite, including these release/navigation source tests and the corrected creator-label behavior. The earlier partial-run results above remain the historical record of this follow-up.
