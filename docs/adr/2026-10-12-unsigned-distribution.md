# Unsigned Apple Silicon distribution with update notices

[ADR index](Intro.md) · [Documentation index](../intro.md)

**Status:** accepted. D05 and D16 were confirmed on 2026-10-11; recorded in P00 on 2026-10-12.

## Context

The project has no Apple Developer account. v1 needs a reproducible distribution path without making signing enrollment a delivery prerequisite.

## Decision

P15 builds an unsigned arm64 DMG and publishes it on GitHub Releases. The app checks for newer releases and offers a link; the user downloads and installs updates. v1 has no Intel build, signing, notarization or silent automatic update.

## Consequences

Installation documentation must explain the first opening of an unsigned app. Users perform updates themselves. P02 and P15 must verify native modules and packaged startup; local development success is insufficient. Signing and additional platforms require a later explicit decision.
