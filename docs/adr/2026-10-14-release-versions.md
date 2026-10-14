# One stable release version and independent publication checkpoints

[ADR index](Intro.md) · [P15 plan](../../plan/phase-15-packaging-and-updates.md)

**Status:** accepted agent decision under D24, 2026-10-14.

## Context

The app was 0.1.0 while its tested library and skills were 0.2.0. A release must identify one tested source and allow recovery across GitHub, npm and the skills repository. Those services cannot be committed atomically. npm publishing needs a configured OIDC relationship; no npm token belongs in CI.

## Decision

Release identifiers are canonical stable `X.Y.Z` and tag `vX.Y.Z`. The app manifest, public voidra manifest/reader constant and every bundled Voidra skill declaration share that version. Standalone check commands pin the exact matching voidra version; version alignment updates authored skill references and generated intake guidance. Format version 1 and General template version 1.0.0 remain independent contracts; a marketing version bump does not change them. The first pipeline proof uses matching 0.2.0: GitHub marks 0.x previews as prereleases and npm publishes them under next. The final v1 release uses 1.0.0 and latest. Published test versions are retained and reported.

Build/test/stage all assets and checksums before making GitHub public. Compare tag/source, notes, assets and package integrity before reusing any step. GitHub assets and npm provenance are immutable completion evidence; a mismatch stops rather than replacing published data. GitHub publishes first, then its same-tag workflow dispatch starts the dedicated npm OIDC workflow. Skills publish locally after registry verification using the existing Hussain7Abbas account, avoiding a cross-repository CI secret. The source repository's GITHUB_TOKEN can explicitly dispatch another workflow; it does not need a stored personal npm token.

A retry uses the original tag and matching existing artifacts. It never moves a tag, deletes a published version or silently ships newer working-tree bytes under an existing version. A partial success is recorded explicitly with the remaining destination. Update notices compare stable versions numerically, ignore draft/prerelease releases and open only this repository's validated release URL. Checks can be disabled; failures stay quiet until the next scheduled attempt.

## Sources and limits

[Semantic Versioning](https://semver.org/), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm trust CLI](https://docs.npmjs.com/cli/v11/commands/npm-trust/) and [GitHub workflow dispatch](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). Installed npm 11.6.2 lacks trust configuration. The isolated npm 11.21.0 command supports it and is compatible with pinned Node 24.13.0; current npm 12.2.0 requires a newer Node patch, so global toolchain upgrades are unnecessary. Existing npm authentication currently returns E401 and must be renewed before configuring trust. No successful OIDC publication is claimed yet.
