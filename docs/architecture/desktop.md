# Desktop architecture

[Architecture index](Intro.md) · [Design system](../design-system.md)

`apps/desktop` builds a static Next.js renderer and three Electron bundles: main, sandboxed CommonJS preload, and utility project service. The renderer is served only from `app://voidra-project/`; there is no HTTP server. Protocol resolution canonicalizes assets and rejects origin/path escapes. CSP allows local assets and exact hashes of trusted generated bootstrap scripts. Renderer Node integration is disabled, context isolation/sandboxing enabled, permissions denied, and navigation/popups blocked.

The bridge validates request/response/event shapes with zod. Main-process handlers verify the sender is the trusted top-level frame. OS folder selection is a narrow command; opening from recents is limited to existing saved paths. The renderer never gets filesystem, shell or raw Electron/IPC objects. TanStack Query caches snapshots and invalidates them on project/theme/service events.

One utility process owns each project's native SQLite connection. Main supervises it, reports a stopped connection and attempts bounded restart; a manual reconnect resets that budget. Graceful shutdown closes SQLite and flushes native coverage in test runs. Separate utility processes isolate failure and keep future indexing work out of the window thread. See [the process ADR](../adr/2026-10-13-utility-process.md).

Canonical project paths map to one window; in-flight opens are coalesced. A second instance forwards its requested folder to the running app. Recent folders and appearance persist atomically under the app's own data directory. Missing folders offer Locate/Remove; removing a shortcut leaves project files untouched. P02 only checks planning-folder presence, not contents; actual records arrive in P03.

SQLite must be rebuilt for Electron's ABI, even though host/Electron share a Node major. CI launches the real exported app, checks keyboard/axe behavior, creates an unsigned arm64 directory package, then starts that packaged executable and checks SQLite through its real utility service. UI/preload execution is covered by end-to-end behavior; no percentage target is imposed on renderer components.

Primary references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [Next static exports](https://nextjs.org/docs/app/guides/static-exports), and [axe integration limitations](https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/error-handling.md).
