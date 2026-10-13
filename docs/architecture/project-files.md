# Project files and the rebuildable index

[Architecture index](Intro.md) · [Format API](../format/api.md) · [Watcher ADR](../adr/2026-10-13-project-watcher.md)

The utility process owns a `ProjectWorkspace`. It reads `.voidra/` using `checkProject`, retaining the package's diagnostics and validated records. Bridge display objects validate transport shape; the Node-only format/parser code stays in the utility process and never enters the sandboxed preload.

SQLite holds action/run display records and uses schema version 1. It lives under the app-data directory keyed by the canonical project path. A missing, obsolete or corrupt database rebuilds from planning files. File validation errors make the view read-only and include the project-relative file, field and line. Newer formats keep the package's update diagnostic and do not permit writes.

Chokidar watches `.voidra/` with atomic-write handling, a short stability delay and debounce. Notifications compare complete display snapshots, not filesystem event counts. Prepared operations retain the previous complete index and expose the package's recovery diagnostic. Recovery is explicit; watchers never repair source files.
