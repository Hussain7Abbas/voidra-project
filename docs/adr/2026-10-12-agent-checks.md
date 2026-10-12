# Real-agent checks run locally, outside CI

[ADR index](Intro.md) · [Documentation index](../intro.md)

**Status:** accepted. D06 and D17 were confirmed on 2026-10-11; recorded in P00 on 2026-10-12.

## Context

Real agents require authenticated CLIs, nondeterministic model responses and paid access. A deterministic fake agent can test the app's file/watch/gate behavior but cannot prove real skill behavior.

## Decision

CI runs unit/integration checks and, from P02/P03 onward, the Electron harness and fake-agent scenarios. The implementing agent performs the [coverage matrix](../../plan/main.md#real-agent-coverage-matrix) locally using Haiku in Claude Code and Luna in Codex at low effort. A failed small-model step is retried with that agent's default model and classified as a skill problem or model limit.

## Consequences

Record exact commands, models, effort, files, gates and commits in phase evidence. Never call a fake-agent scenario a real-agent check. P00 requires no real-agent run because it creates no product skills; CI never invokes the authenticated agent CLIs.
