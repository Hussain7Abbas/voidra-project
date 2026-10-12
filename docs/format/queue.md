# Personal queue

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/local/pending-actions.md`

Frontmatter: `queuedBy`, `queuedAt`. Body: ordered Markdown checklist of action IDs. Each ID exists, is unique and belongs to an agent action. Eligibility can change after a run reaches a gate, so checking the file validates references rather than automatically removing waiting entries.

## Example

```markdown
---
queuedBy: You
queuedAt: 2026-10-13T00:00:00Z
---

```
