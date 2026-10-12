# pnpm monorepo with one format package

[ADR index](Intro.md) · [Documentation index](../intro.md)

**Status:** accepted. Product decisions D02/D03 were confirmed on 2026-10-11; recorded in P00 on 2026-10-12.

## Context

The app and skills must share a file-format contract, while the format validator must run independently of Electron. Maintaining separate schema implementations would allow incompatible output and duplicate lifecycle rules.

## Decision

Use one pnpm workspace. `apps/desktop` will own the desktop app, `packages/voidra` will own the single npm package containing format rules and the CLI, and `tools/*` owns repository tools. Skills, templates and fixtures live in this repository when their phases add content. P00 creates only the real `tools/standards` member.

Build the shared format first and then a thin end-to-end slice before widening features, as D13 describes. Keep Electron out of the format package.

## Consequences

Schema and lifecycle changes can be reviewed alongside their consumers. The workspace adds coordinated tooling and release responsibilities, but avoids cross-repository format drift. Empty future directories are not scaffolding deliverables.
