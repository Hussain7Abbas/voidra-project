# File I/O and approvals

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** Public package API and CLI

UTF-8 Markdown frontmatter uses YAML 1.2. Parsing retains the YAML document, original bytes, newline style, BOM and untouched body. Unchanged serialization is byte-identical; edits retain unknown fields and YAML comments. Approval hashes cover exact bytes of requirements, blueprint and acceptance, including formatting. Missing/changed files require approval again for plan-gated types; Docs/chore and Research need none. Release review is fingerprinted separately. A group validates its intended overlay before writing, journals snapshots, checks expected hashes and uses same-directory flushed temporary files plus rename. Recovery preflights all snapshots and refuses conflicting outside edits. Expected-hash checks are optimistic; cooperating writers share an exclusive lock, while arbitrary external editors can still race the final OS rename. No read/check command repairs files.
