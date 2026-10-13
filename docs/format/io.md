# File I/O and approvals

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** Public package API and CLI

UTF-8 Markdown frontmatter uses YAML 1.2. Parsing retains the YAML document, original bytes, newline style, BOM and untouched body. Unchanged serialization is byte-identical; edits retain unknown fields and YAML comments. Approval hashes cover exact bytes of requirements, blueprint and acceptance, including formatting. Missing/changed files require approval again for plan-gated types; Docs/chore and Research need none. Release review is fingerprinted separately. A group validates its intended overlay before writing, journals snapshots, checks expected hashes and uses same-directory flushed temporary files plus rename. Recovery preflights all snapshots and refuses conflicting outside edits. Expected-hash checks are optimistic; cooperating writers share an exclusive lock, while arbitrary external editors can still race the final OS rename. No read/check command repairs files.

A stale approval/review in an unchanged sibling action remains a visible human gate and does not block a different action’s fresh approval. Overlay and post-write validation still reject structural errors and any unresolved stale gate in an action whose files the operation changes. Rollback may restore a stale gate, which remains blocked until a fresh decision; it cannot authorize implementation.

Existing conflicts remain validation errors. An operation may edit unrelated records while preserving the exact conflict diagnostics captured in its private receipt. It never changes a conflicted file, introduces a new reference to a conflicted record or tolerates a newly arriving conflict during that operation. Metadata conflicts still prevent writes because the common project rules cannot be read. CLI validation continues to report the conflicts.
