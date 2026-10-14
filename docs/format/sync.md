# Sync records

[Format index](Intro.md) · [Documentation index](../intro.md)

**Location:** `.voidra/syncs/<sync-id>.md`. Format 1, minimum reader `voidra@0.2.0`.

Frontmatter: `id` (`sync-` plus six Crockford characters, matching the filename), `examinedRevision` (the Git HEAD examined), `since` (the previously synced reachable revision or null), `commits` (unique outside commit hashes examined), `proposals` (unique existing idea/action IDs), `consumedRecords` (existing shared record paths), `by` (configured Git identity), and `at` (ISO timestamp). Git hashes have 40 or 64 lowercase hexadecimal characters. Unknown fields survive edits. The Markdown body summarizes findings and links to source evidence.

The standalone adapter checks the actual repository root, HEAD, ordered outside commits and nearest reachable sync revision. A valid `Voidra-Action` trailer identifies tracked work; a subject that merely mentions a trailer does not. Branch switches ignore unreachable sync revisions. Sync makes no Git or source-code writes.

Inferred profile updates carry the original block revision, a matching template value and an examined source commit. Confirmed values remain unchanged; different values produce draft Profile changes for review. Ideas start New, other proposed actions start Ready, and nothing is implicitly queued or approved.

The sync record, profile updates and proposal records are written as one durable group. A private serialization token guards simultaneous writers. An interrupted group is recovered only when its Sync receipt belongs to the current reachable history and the shared writer verifies dead ownership and unchanged partial files. Unrelated pending operations and outside edits stop recovery. A repeat at the examined HEAD reuses the saved record and proposals; the next context has no outside commits at that HEAD.

Consumption is persisted with this group. Undo blocks earlier app edits to records consumed by Sync, including after restart. Later app edits use a new history baseline and remain reversible. Prepared operations block replay before the group completes.
