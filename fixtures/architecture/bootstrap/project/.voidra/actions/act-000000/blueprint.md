---
{ action: act-000000 }
---
## Approach
Use a local SQLite repository behind the note service and a desktop screen. Keep storage replaceable through the repository interface.

## Testing seams
Test repository save/load against a real temporary database; service ownership through its public API; and screen save/reopen through Electron. Corrupted data produces a visible diagnostic without silently discarding notes.

## Proposed ADRs
Local-only persistence: hard to reverse after notes exist; surprising without context for a project tool; trades collaboration for privacy and offline operation. Propose docs/adr/<date>-local-notes.md after plan approval, during implementation.

Establish AGENTS.md, a reproducible install, formatting and public-boundary checks before the first save path. Run one failing repository round-trip test, implement it, then test the service and screen.
