# Profile blocks

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/profile/<block>.md`

Frontmatter: `block` (slug matching the filename), `title`, `answers`. An answer has `id` (slug), `question`, `answer` (JSON-compatible text/list/boolean/number/null), `status` (`confirmed`, `inferred`, `assumed`, `open`), optional `source`, `updatedAt`, `confirmedBy`. Body: notes. Template content and question rendering arrive in P04/P05.

## Example

```markdown
---
block: problem
title: Problem
answers:
  - id: goal
    question: What is the goal?
    answer: A working example
    status: confirmed
---

```
