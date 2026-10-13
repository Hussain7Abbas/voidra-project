# Persistent app undo history

**Decision:** Agent implementation decision under D24, 2026-10-13 (P10).

Keep at most 100 operations and 32 MiB of distinct UTF-8 snapshots per project in its existing local SQLite database. Content is stored once by SHA-256; each operation records its label, time, changed paths, before/after hashes and the run IDs already present when the edit was prepared. Reject a single edit whose required snapshots exceed the payload limit before changing files. Prune oldest completed history and unreachable bodies; SQLite may retain free pages, so this is a logical payload limit rather than a file-size guarantee.

Capture app edits through a root-scoped asynchronous observer of the shared grouped writer. Prepare the SQLite entry while the writer owns its lock, before replacement; mark it complete only after the durable file receipt. Prepared entries and undo/redo replay IDs reconcile with those receipts after restart. Agent and CLI writes do not inherit the app observer. The bridge classifies every project command; new edit commands must supply a history label.

Replay uses the same validated writer and preserves exact bytes. Recheck consumed records from persistent runs, current hashes and lock guards before mutation and again under the writer lock. Retain consuming run identities across interruption and lock cleanup. An external overwrite requires a confirmation tied to the current hashes; cancellation writes nothing. Refuse deleting a file changed outside the logged edit. A bounded explicit writer option permits undoing initialization only when no shared project files remain, never a partially invalid project. Receipts remain private for recovery.

Undo tables survive index schema rebuilds. Invalid history clears only history tables, displays a notice and preserves project files and index tables. Git commits, source files and implementation results remain outside app edit history.
