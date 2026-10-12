# Cache bridge snapshots with TanStack Query

[ADR index](Intro.md)

P02 confirms using TanStack Query for renderer data, matching the storylens dashboard pattern. Query functions call a checked preload bridge, with no HTTP server. Native events invalidate the affected snapshot; failures produce visible error/retry states.

This supplies one cache/retry/loading path as later screens grow. The cache is disposable, never a source of truth; project records and app preferences remain on disk. Main/service validate all arguments and results regardless of cached renderer data.
