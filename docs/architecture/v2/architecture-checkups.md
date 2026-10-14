# Regular architecture check-ups

[V2 index](Intro.md) · [Retrospectives](retrospectives.md)

## Problem and built baseline

The [general architecture skill](../../../skills/voidra-architect-general/SKILL.md) plans actual queued work. [Knowledge/document reads](../../../packages/voidra/src/documents.ts) safely link repository docs and ADRs. [P11](../../verification/p11.md) verifies contained reads and the ADR bar; no background architecture scheduler exists in v1.

## Proposed design

An explicitly enabled local schedule requests a bounded Research check-up over selected architecture documents, profile and recent tracked changes. Define the question before scanning, compare evidence with existing decisions and propose linked ideas for divergence or accumulated debt. Reuse rejected/duplicate ideas rather than creating a recurring flood. Remain quiet when findings do not change; notify only new actionable findings, failure or required input. No source changes, commits, ADR acceptance or background model use occurs without the selected policy.

## Format and compatibility

Private local schedules need no shared format change. Findings can use existing Research/actions; optional schedule provenance is additive. If shared schedule definitions become a feature, separate that schema from local execution/credential state and advertise the reader minimum.

## App and skills

Add enable/pause, scope, cost/model and last-result controls. Architecture dispatch performs the review through normal Research ownership and gates. New hard-to-reverse tradeoffs are ADR proposals, not silently accepted decisions.

## Risks and open questions

Choose offline/laptop-sleep behavior, missed runs, budget limits and active-run contention. Stale output must not mutate a project changed since the check began. Decide whether code evidence is inspected by a local coding agent; app AI continues excluding source.

## Dependencies and verification

Depends on v1 Research/knowledge and [agent launch](agent-launch.md) or an explicit external runner. Test schedule pause, unchanged findings, duplicate rejection, machine sleep, process death, input revision changes and no automatic source/Git effects.
