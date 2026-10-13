# Plan

When answers establish scope, publish a three-file proposal:

```json
{"action":"act-…","kind":"plan","summary":"Dispatched <architecture-skill>; evidence and scope…","requirements":"## Goal\n…\n## Requirements\n…\n## Out of scope\n…","blueprint":"## Approach\n…\n## Testing seams\nPublic behavior boundaries…\n## Proposed ADRs\n…","acceptance":"- Observable acceptance checks…"}
```

Propose an ADR only when all three hold: the decision is hard to reverse, surprising without context, and a real trade-off. Explain each criterion; otherwise say none and keep the choice in the action. Do not create accepted ADR records during planning. Name the proposed file by date and title unless the repository already has an ADR naming convention. Add only settled terms to GLOSSARY.md, preserving existing definitions; unresolved alternatives are not terms. A wide refactor uses expand–contract: add compatible paths, migrate callers, verify behavior, then remove old paths in an approved slice. Preserve compatibility during each demonstrable step.

If the work cannot fit one session, publish `kind:slices` with at least two `{title,description}` entries. Each slice is a thin demonstrable path through its needed data, logic, interface and tests. Explain seams and exclusions in descriptions. The helper links the ordered children and blocks the parent; each child gets its own plan approval and commit. Do not implement the parent or create layer-only slices.

Write proposals to `.voidra/local/planning-<run>.json`, then `planning --token TOKEN --report FILE`. The helper preserves answered rounds, ends the run and releases the lock. Stop this action at the resulting human gate. A changed approved plan requires fresh approval, even with the app closed. Read saved feedback when revising plans; never manufacture approval hashes.
