# voidra-report

[V2 index](Intro.md) · [Dashboards](dashboards.md)

## Problem and built baseline

Run results, exact decisions and release notes are source-linked public records. [Knowledge collection](../../../packages/voidra/src/knowledge.ts) and [Git reads](../../../tools/run-engine/src/git.ts) already expose evidence; [P11](../../verification/p11.md) proves source-linked decisions and [P12](../../verification/p12.md) proves released membership.

## Proposed design

A read-only reporting skill accepts a project and bounded period, builds a deterministic evidence manifest and summarizes shipped work, completed work, blockers and decisions with links. Distinguish those states and include remaining issues, unsupported dates and missing history. Preview Markdown or export to an explicitly chosen destination. Optional language-model prose consumes only the selected planning evidence and cannot create actions or send a report without a separate request.

## Format and compatibility

Ordinary exports require no format change. If saved reports become shared records, add immutable period/criteria/source-revision provenance under a reader minimum; do not duplicate source decision bodies or alter their approvals. Private API keys and source code are excluded.

## App and skills

Add period/criteria preview and export controls; the terminal skill works without the app and uses the same evidence collector. Avoid automatically publishing, emailing or creating chat messages.

## Risks and open questions

Decide report timezone, late-arriving commits and whether date ranges follow result completion or Git time. A polished narrative must not hide incomplete evidence. Bound context size and clearly separate verified facts from generated interpretation.

## Dependencies and verification

Depends on [dashboard projections](dashboards.md), knowledge and release/Sync records; optional prose depends on P13 privacy controls. Test exact period boundaries, source links, unchanged files/HEAD, deterministic manifests and absence of private/source content in model requests.
