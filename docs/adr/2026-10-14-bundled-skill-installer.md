# Bundled installers own exact local skill copies

**Status:** accepted agent decision under D24, researched 2026-10-14 for P14.

## Context

D04 develops skills in Voidra Project and copies release versions to voidra-skills. A desktop installation must work offline with the app's exact tested payload, preserve edits, and report format compatibility. Depending on a fetched CLI would add network/runtime dependency and could select a different payload.

## Current locations

| Agent | User installation | Project installation |
| --- | --- | --- |
| Claude Code | `$HOME/.claude/skills/<name>/` | `<project>/.claude/skills/<name>/` |
| Codex | `$HOME/.agents/skills/<name>/` | `<project>/.agents/skills/<name>/` |

Checked against [Claude Code skills](https://code.claude.com/docs/en/skills) and [OpenAI local skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills). Codex searches project ancestors up to the repository root and user/admin/system scopes; Claude supports project ancestors and additional directories. This app installs user copies; make skills-link retains its development/project-local behavior. Neither implementation replaces every agent's complete skill directory.

## Decision

Bundle self-contained copies and install directly into each documented user directory. Do not invoke npx in the app. The [skills CLI](https://github.com/vercel-labs/skills) supports named agents, local repositories, --global, --yes and copying, so it can technically be called from an application. Its distribution/install tooling is useful for terminal users, but the app owns its exact version/hash marker, editable-copy preview and compare-before-write guards. The distribution repository pins skills CLI 1.7.0; its inspected implementation still uses CODEX_HOME or ~/.codex/skills for global Codex installation, despite the current official .agents/skills guidance. Direct installation avoids inheriting that legacy global target. The installer refuses symlink destinations, stages the complete new copy before replacing an old one, and preserves a backup if final placement fails. App settings never modify project source or agent configuration files.

Every skill declares skill version and written format in metadata. The installed voidra-skill.json records version, format and content hash. Unmanaged copies or hash mismatches require an explicit preview/confirmation bound to the exact displayed contents. Show compatibility in both directions for the open project's format. The first-run offer is optional and acknowledged once in saved app settings.

Publishing retains voidra-skills' own rules: catalog/templates shared changes publish separately; each subsequent commit touches one skill only and passes make validate and make publish. Prevalidate the entire staged release before any push. Dry runs display exact path/content differences in an isolated temporary clone and never write the requested destination or a remote. Stop at the first failure; already published skills are reported honestly and remaining skills are not pushed.

## Consequences

Updates work without installed coding-agent CLIs or network access. Each agent has an independent copy; hand edits and other skills survive. Future folder changes require source-linked research, not guessed fallback directories. skills.sh terminal discovery remains independent of app installation and does not promise immediate directory indexing.

A local invocation of the pinned CLI confirms that explicit Claude Code/Codex project installation with --copy produces both documented project folders and byte-identical payloads in a temporary project. Telemetry is disabled and global installations are untouched; see [P14 evidence](../verification/p14.md).
