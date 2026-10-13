# Debounced project-file watching

[ADR index](Intro.md) · [Desktop architecture](../architecture/desktop.md)

P03 uses pinned Chokidar 5.0.0 to watch only `.voidra/`, with symlink following disabled. Native fs notifications have inconsistent rename/duplicate behavior; [Chokidar](https://github.com/paulmillr/chokidar) normalizes these and handles editor atomic writes. The registry pin is 5.0.0 even though the moving repository README already discusses the next major.

Atomic-write coalescing is 75 ms, size stability is 120 ms with 25 ms polling, and notification debounce is 100 ms. Real Electron/file tests require outside changes to arrive within one second. Stable display snapshots deduplicate repeated notifications; app mutations publish their completed snapshot once, so the watcher echo produces no second UI update.

The service validates through `voidra` and caches actions/runs in SQLite schema version 1. Missing, obsolete or corrupt caches rebuild. During a prepared grouped operation it retains the previous complete cache and exposes validation/recovery diagnostics, then rebuilds after explicit recovery. A cache rebuilt while an operation is pending has no complete previous view to show. No watcher silently repairs planning files.
