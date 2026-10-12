# Markdown with YAML frontmatter, one file per record

[ADR index](Intro.md) · [Format specification](../format/Intro.md)

**Status:** accepted within P01, 2026-10-13; follows the approved vision.

## Context

Agents must operate without the app, and users must review planning changes in git. A database-only planning store would prevent that and concentrate team edits.

## Decision

Store each planning record as UTF-8 Markdown with YAML frontmatter under .voidra. Metadata, locks and operation journals use JSON. The format package owns schemas, lifecycle rules, parsing, approval and recoverable writes. SQLite remains a rebuildable app index.

## Consequences

Preserve unchanged bytes, comments and unknown fields. Validate references across records. Use local journals and expected hashes to recover multi-file changes. Human editing remains possible, so conflict detection and read-only errors are part of the contract.
