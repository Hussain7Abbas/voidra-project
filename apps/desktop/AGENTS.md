# Desktop app

Extends [root instructions](../../AGENTS.md). Desktop package name is `voidra-project`, app ID `dev.voidra.project`, product name Voidra Project. App data uses `voidra-project`; never reuse the legacy `voidra` directory.

- `src/main/` owns windows, native dialogs/menus, preferences, protocol and service supervision. `src/project-service/` runs one utility process per project and owns native SQLite, the debounced `.voidra/` watcher and rebuildable action/run/profile cache. Project work uses the shared format package; no duplicate format/lifecycle rules.
- `src/preload/` bundles to sandbox-compatible CommonJS. Expose only validated requests, checked responses, stripped subscription payloads and unsubscribe functions. Never expose Electron objects, IPC events or arbitrary channels.
- `src/shared/bridge.ts` is the zod/TypeScript boundary. Validate sender/main frame, arguments, utility messages and returned data. New bridge commands must stay narrow. Utility request correlation uses requestId independently from action/run IDs.
- `app/` exports static Next.js pages; `src/renderer/` contains the client shell and UI. No Next server or runtime port. Frontend dependencies are build dependencies; runtime native dependencies are packaged separately.
- Use storylens dashboard Ink & Iris tokens, Inter Variable and Lucide. Browser support is the pinned Electron Chromium runtime; native dialog closedby is supported. Do not add general-browser fallbacks or a second design system.
- HTML is served with the saved effective theme before paint and a CSP of local assets plus exact bootstrap script hashes. No unsafe-inline/eval, remote scripts, frames or popup/navigation permissions.
- Unit/native tests are in `tests/`; real Electron tests opt into source-mapped subprocess V8 coverage. Direct stripped-TS subprocesses do not preserve offsets and must not pollute that report. Keep 80% main/service gates and 90% format/standards gates.
- `e2e/` launches the built app with disposable data. Only the OS chooser is substituted; clipboard checks use the real Electron clipboard; actual files, IPC, windows and utility processes remain real. Axe legacy mode is necessary because Electron cannot create an auxiliary browser target; there are no cross-domain frames, which CSP forbids.
- `make setup` rebuilds SQLite for Electron's ABI. `make dev` opens the exported app; `make e2e` checks workflows/axe. `make package-dir` and `make smoke-packaged` verify unsigned arm64 output and SQLite loading inside the package.

- Run helpers come from `tools/run-engine`. Prepared operations and unfinished results hold the previous complete index. Reviews carry exact displayed action/run fingerprints into expected-hash writes. Recovery UI copies agent commands; it never writes implementation Git history or reconciles the Git index.
- The utility loads bundled templates through `voidra`, detects manifests/source filenames without reading code, and atomically creates planning data. Profile edits carry exact displayed block hashes; confirmed changes create draft actions. Keep all renderer controls labeled and preserve inferred/confirmed/assumed/open status and source evidence.
- Package the arm64 process helper outside asar and keep preload free of Node-dependent imports.

Keep [desktop architecture](../../docs/architecture/desktop.md), [design system](../../docs/design-system.md) and evidence current. `CLAUDE.md` only imports these instructions.
