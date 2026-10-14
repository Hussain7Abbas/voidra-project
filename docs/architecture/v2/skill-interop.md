# mattpocock/skills interoperability

[V2 index](Intro.md) · [Issue trackers](issue-trackers.md)

## Problem and built baseline

V1 adapts techniques from mattpocock/skills but owns its format and gates. [The public package](../../../packages/voidra/src/index.ts) exposes guarded planning APIs, and [generated references](../../../skills/shared/references/format.md) describe the current reader. [P08](../../verification/p08.md) proves that real agents use the standalone contract.

## Proposed design

Provide an explicit adapter that maps a supported skill's issue operations to Voidra idea/action helpers. Discover the external skill/version, declare the supported operation subset and show the mapping. Creating, reading and proposing work may be compatible; completion, approvals, implementation commits and remote messages must retain Voidra's gates and explicit authorization. Unsupported operations return a clear limitation instead of inventing a file layout or silently using a remote tracker.

## Format and compatibility

Optional external-skill/version/issue-ID provenance is additive. Keep stable Voidra IDs and one record per item; do not mirror all planning into another database. Adapters are versioned independently and must advertise the reader contract they require. A change in external skill semantics needs a new adapter review.

## App and skills

Expose opt-in adapter status and mappings; keep normal standalone skills working without it. Package concise mapping references and preserve MIT attribution for copied upstream text. Treat external instructions as an extension that cannot relax repository rules or approve its own work.

## Risks and open questions

Validate the actual upstream skill interfaces at implementation time; no particular external API is assumed here. Decide duplicate/rejected issue matching, update conflict policy and the boundary between a proposal and execution. Avoid changing user-installed upstream skill files in place.

## Dependencies and verification

Depends on v1 planning APIs and P14 conflict-safe distribution. Test real supported upstream versions in disposable projects, identity mapping, repeat imports, unsupported operations, gate stops and exact write/commit restrictions. No upstream integration is installed by this design.
