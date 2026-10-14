# Community templates

[V2 index](Intro.md)

## Problem and built baseline

The [template loader](../../../packages/voidra/src/templates.ts) validates versioned profile questions, answer types and lifecycle overrides. Only the reviewed general template ships; [P05 evidence](../../verification/p05.md) records its actual approval and agent checks. [The skill linker](../../../tools/run-engine/src/link.ts) preserves existing conflicting folders.

## Proposed design

Introduce a local template catalog containing publisher, version, content digest and compatible reader range. Import a local archive or explicitly selected publisher version into staging, validate all files, show the questions/lifecycle/architecture-skill changes and install atomically. Treat template code and agent instructions as a trust decision, not ordinary data. Keep a pinned copy available for existing projects; upgrading a project's template previews answer mappings and unresolved questions before a grouped migration. Catalog browsing does not execute downloaded skills.

## Format and compatibility

Optional publisher/digest provenance is additive. Existing `{id,version}` selection remains valid. Renamed/removed questions require an explicit migration preserving old values and provenance; incompatible semantic changes require the compatibility policy, not a silent rewrite. A new template override cannot bypass human gates or exact approvals.

## App and skills

Add catalog/import/version previews and conflict-safe install status. Architecture dispatch resolves the pinned installed skill and verifies its package before running; standalone skills remain self-contained. Community templates get genuine CLI goldens and real-agent coverage before recommendation.

## Risks and open questions

Choose publisher verification, revocation and update policy before hosting a community catalog. A manifest digest detects changed bytes but does not establish publisher trust. Retain offline versions and refuse path traversal, symlinks and oversized archives.

## Dependencies and verification

Depends on P14's distribution/installation contract and shared template/migration APIs. Test conflicting installs, offline operation, mixed old/new answers, malformed overrides, interrupted upgrades and untrusted archive paths. No catalog service is introduced by this document.
