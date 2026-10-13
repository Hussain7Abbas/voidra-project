# Profile blocks

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/profile/<block>.md`

Frontmatter: `block` (slug matching the filename), `title`, `answers`. An answer has `id` (slug), `question`, `answer` (JSON-compatible text/list/boolean/number/null), `status` (`confirmed`, `inferred`, `assumed`, `open`), optional `source`, `updatedAt`, `confirmedBy`. Body: notes. The template defines question types and help. P04 renders and edits these answers; P05 reviews the final content. Null is unanswered. Confirming an inferred answer retains its source and records confirmedBy/updatedAt. Changing a confirmed value creates a draft Profile change linked to the block, with the old and new values.

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
