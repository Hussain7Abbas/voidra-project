# Develop skills here and copy them for distribution

[ADR index](Intro.md) · [Documentation index](../intro.md)

**Status:** accepted. D04 was confirmed on 2026-10-11; recorded in P00 on 2026-10-12.

## Context

Skills must write files the app can understand. Developing skills independently of the format and app risks version drift, while terminal-only users need distribution through skills.sh.

## Decision

Develop `skills/` and `templates/` in `voidra-project`, bundle them with the app, and copy release versions to `voidra-skills` through that repository's validation/publication workflow in P14. Generate shared format and lifecycle references from the `voidra` package and check for stale generated output in P01.

## Consequences

This repository owns development, tests and version alignment. The distribution copy must not become a second development source. Installation and update must protect user-edited skills. P00 creates no skill files, distribution placeholders or release automation.
