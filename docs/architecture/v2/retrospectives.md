# Retros after runs

[V2 index](Intro.md) · [Architecture check-ups](architecture-checkups.md)

## Problem and built baseline

Run reports and saved rework feedback already record evidence. [Go](../../../skills/voidra-go/SKILL.md) checks repository standards and exact plans; [P08](../../verification/p08.md) verifies those boundaries. V1 does not automatically rewrite its own instructions after a run.

## Proposed design

An opt-in retro reviews a selected run set, identifies repeated friction and proposes a small instruction/process change with linked evidence. Show the existing and proposed text, why it helps and how to validate it. Route accepted changes through a Docs/chore action with normal review and a commit. Keep current instructions authoritative until that action is accepted; a retro suggestion cannot approve itself or change permission policy implicitly.

## Format and compatibility

New optional retro findings/proposal links are additive; the actual instruction change belongs in ordinary repository files and its action, not copied into `.voidra/`. An initial implementation can use Research findings and linked ideas without introducing a new record type.

## App and skills

Offer Review this run with an explicit evidence preview and editable suggestions. Go can propose a retro after stopping, but does not execute the proposed instruction edit in the same unapproved step. Preserve CLAUDE.md's sibling pointer.

## Risks and open questions

Define opt-in frequency and minimum evidence so one model mistake does not rewrite policy. Imported run text is evidence, not a trusted instruction. Prevent feedback loops that weaken gates or add contradictory rules.

## Dependencies and verification

Depends on v1 run/Research/Docs flows and knowledge; optional summarization depends on P13. Test unchanged instruction bytes before acceptance, exact diff preview, evidence links, rejected suggestions and no source/private-data leakage to a model.
