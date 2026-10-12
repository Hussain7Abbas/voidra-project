# Release records

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/releases/<version>.md`

Frontmatter: `version` (matching filename), `actions`, `status` (draft, released), optional `tag`, `date`. Released records require a tag and included actions in Released. P12 supplies orchestration; P01 only defines the record and lifecycle guards.

## Example

```markdown
---
version: 0.1.0
actions:
  - act-000000
status: draft
---

```
