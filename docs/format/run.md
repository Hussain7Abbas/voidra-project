# Runs and start records

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/actions/<act-id>/runs/<time>-<agent>-<run-id>.md`

Frontmatter: run-prefixed `id`, `action`, `agent` (claude-code or codex), `startedAt`, `consumedRecords`, `fromStage`, `outcome` (running, advanced, waiting, failed, interrupted), optional `endedAt`, `toStage`, `commit`, `checks`. Running records have no endedAt; completed outcomes require it. Consumed records are existing record IDs or project-relative record paths (for example `.voidra/profile/problem.md`). They identify items read before work and survive interruption for undo blocking. Body: summary. Commit is optional until known; P03 reconciles it using trailers rather than requiring a self-referential commit hash.

## Example

```markdown
---
id: run-000000
action: act-000000
agent: codex
startedAt: 2026-10-13T00:00:00Z
consumedRecords:
  - act-000000
fromStage: discovery
outcome: running
---

```
