# Question rounds

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/actions/<act-id>/questions.md`

Frontmatter: `action`, `rounds`. A round has a positive `round`, `askedAt`, `questions`; each question has q-prefixed `id`, `text`, `why`, `options` (`label`, `description`, `recommended`), `allowFreeText`, optional `dependsOn`, `answer` (`kind`: choice, text or agent-decides; optional choice/text, `by`, `at`) and `agentChoice`. IDs are unique; choices refer to provided options, text requires free-text permission. Prerequisites must refer to earlier answered questions. Agent-decides remains answered while the choice is pending, so the next agent run can make it. Body may hold notes.

## Example

```markdown
---
action: act-000000
rounds:
  - round: 1
    askedAt: 2026-10-13T00:00:00Z
    questions:
      - id: q-000000
        text: Which option?
        why: Defines scope
        options:
          - label: a
            description: Small scope
            recommended: true
        allowFreeText: true
        answer:
          kind: choice
          choice: a
          by: You
          at: 2026-10-13T00:00:00Z
---

```
