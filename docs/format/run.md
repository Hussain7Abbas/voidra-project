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

## Ordered-intent consumption (reader 1.1.0)

A run started from versioned Actions intent carries optional `orderedIntent: {version: 1, revision: <sha256>, queueRevision: <sha256>}`. It requires `taskTracking: 1`. These hashes identify the exact private ordering/request state consumed at startup. The app maps this receipt to its fixed local ordering paths when checking undo. Do not put those private paths in `consumedRecords`: a shared run must still validate in a fresh clone where private local files are absent. Existing action/dependency/profile consumption and ownership protections remain unchanged. See [queue contract](queue.md).

## Agentic workflow follow-up

Reader 1.2.0 QA runs may carry `quality: {summary, decision, qa, security, questions?}` and `sourceCommit`. Each QA/security part has a summary and nonempty checks with name, passed and evidence. Only an owned unchanged-source review can publish it. `decision` is pass, rework or questions; pass requires all checks passing and advances to Done. Rework preserves evidence in idle TODO; questions append a round in Planning. These read-only results do not create a Git commit.
