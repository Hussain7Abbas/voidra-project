# Maps for large, unclear work

[V2 index](Intro.md) · [Prototypes](prototypes.md)

## Problem and built baseline

Current [Discovery and planning](../../../tools/run-engine/src/architecture.ts) produce question frontiers, exact plans and slices. [Knowledge](../../../packages/voidra/src/knowledge.ts) links decisions instead of duplicating them. [P08 evidence](../../verification/p08.md) proves gate stops and planning-only restrictions.

## Proposed design

Add a planning map that names a destination, settled decisions, open unknowns, constraints/out-of-scope items and evidence. Link maps to actions and question rounds; use them to divide uncertain work into Research, Prototype and implementation slices. A map organizes known information but never makes unanswered questions look settled. Revisions used by an approved plan are pinned explicitly; material map changes invalidate affected scope or require a new approved plan rather than silently changing the destination.

## Format and compatibility

New map records/IDs and optional action references are additive with a reader minimum. Maps link ADRs/glossary and source decisions without copying long-lived knowledge. Keep one file per map, expected-hash edits and a defined revision fingerprint. Changing approval semantics still requires migration/compatibility review.

## App and skills

Provide a readable map/editor, linked questions and slice proposals with accessible list alternatives to any graph. Architecture skills maintain maps during Discovery through the grouped writer; Plan remains source/Git read-only.

## Risks and open questions

Decide whether linked maps share ownership, how map revisions affect approved actions and how to retire obsolete unknowns. Avoid a second mandatory planning document for small chores. Distinguish tentative tradeoffs from approved ADRs.

## Dependencies and verification

Depends on v1 questions, plan fingerprints, slicing and knowledge; [Prototype](prototypes.md) is optional. Test stale map revisions, concurrent updates, unresolved dependencies, link integrity and unchanged source/HEAD in planning-only runs.
