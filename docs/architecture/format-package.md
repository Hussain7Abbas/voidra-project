# Format package architecture

[Architecture index](Intro.md) · [API contract](../format/api.md)

The Electron-independent `packages/voidra` workspace owns format 1. The CLI and future app/skills use the same exported library.

Records are parsed as byte-preserving documents; schema/body validation does not rewrite them. Whole-project inspection resolves IDs, lifecycle stages, dependency/parent graphs, question gates and exact plan approvals. Metadata is inspected first so unsupported newer formats stop before other records are parsed.

The lifecycle engine is pure data and transitions. Disk approval captures the three plan fingerprints and checks them again as expected hashes in an operation. The grouped writer validates a virtual target first, serializes cooperating writers with a local lock, persists a prepared journal, replaces files using flushed temporary siblings, validates the completed project and persists a committed receipt. Explicit recovery compares all before/after snapshots and refuses outside edits. Completed receipts make retries idempotent.

Schemas generate JSON Schema and shared references; `make check` rejects stale output. Fixtures and built-executable tests exercise the same interfaces intended for the app. No cache, GUI, agent execution, commits or tags belong in this package. P02 supplies the desktop shell; P03 begins actual skill integration.
