# P02 — Desktop shell and design system

> **Milestone:** M1 · **Needs:** P00 · **Status:** see [main.md](main.md)

## Outcome

An Electron app that opens a project folder in its own window. It has the Ink & Iris design system and the security boundaries every later phase builds on, and it is packaged and tested end to end.

## Requirements

### In scope

- `apps/desktop`: an Electron main process, a preload script, and a Next.js static-export renderer loaded through the custom protocol `app://voidra-project/`.
- Security:
  - context isolation, sandboxed renderers, Node integration off;
  - a strict content security policy;
  - navigation and pop-ups blocked;
  - every permission request denied.
- A typed bridge whose requests and responses are checked with zod.
- One project service per open project, in an Electron utility process. An ADR confirms or rejects this.
- The design system ported from the storylens dashboard (D08):
  - the token stylesheet and its Tailwind v4 mapping;
  - Inter Variable through fontsource;
  - `lucide-react`;
  - system, light and dark themes through `data-theme`;
  - reduced motion;
  - components: button, dialog, confirm dialog, field, toast (announced through `aria-live`), spinner, page and the app shell with its sidebar.
- **Windows:** one project per window.
  - Open a folder through a dialog, and keep a list of recent projects in the app data folder.
  - The project switcher dropdown in the sidebar works like Obsidian's vault switcher: picking a project focuses its window if it's already open, otherwise opens a new window.
- **Identity:** product name "Voidra Project", app ID `dev.voidra.project`, desktop package name `voidra-project`, never `voidra` (see VISION.md section 15).
- A folder without `.voidra/` shows a placeholder screen; P03 and P04 replace it.
- A Playwright Electron test harness with temporary data folders and `@axe-core/playwright` checks.
- A packaging smoke test: `electron-builder --dir` for arm64, with `better-sqlite3` rebuilt, and a script that starts the packaged app.

### Out of scope

Reading `.voidra/` contents (P03), onboarding (P04), the DMG and updates (P15).

## Blueprint

- **Storylens code:**
  - copy `apps/dashboard/src/styles/globals.css` and `apps/dashboard/src/components/ui/*` from `/Users/hussainabbas/programming/projects/personal/storylens` and adapt them;
  - follow its `apps/dashboard/design-system/MASTER.md` for layout, radii, badges, tables and forms. Verify the stylesheet, component directory and this reference before starting the port; P02 evidence records the source revision and paths used.
  - That code is under PolyForm Noncommercial with Hussain Abbas as the author. You own it, so copying it into this AGPL project relicenses those parts. Record this in an ADR.
- **Data fetching** goes through bridge calls cached with TanStack Query, as in the storylens dashboard. An ADR confirms this.
- **The single-instance lock** forwards "open this folder" requests to the running app.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| P02-01 | Electron and Next.js static-export skeleton | 5 | — | `make dev` opens a window that renders the exported renderer through `app://voidra-project/`. |
| P02-02 | Security boundaries | 3 | P02-01 | Tests prove that navigation, pop-ups and permissions are blocked and that the renderer has no Node access. |
| P02-03 | Typed bridge and project service | 5 | P02-01 | Invalid requests are rejected with a typed error. If the service crashes, the window shows an error and the service restarts. The ADR is recorded. |
| P02-04 | Tokens, fonts, icons and themes | 3 | P02-01 | The light, dark and system themes match the storylens token values. The choice persists and doesn't flash at start. |
| P02-05 | Base components and app shell | 5 | P02-04 | Every listed component exists, works by keyboard and passes axe in both themes. |
| P02-06 | Windows, recent projects and the switcher | 5 | P02-03 | Opening, focusing and opening a new window behave like Obsidian's vault switcher. A missing folder can be located again or removed. |
| P02-07 | End-to-end harness | 3 | P02-05 | Playwright launches the built app with temporary folders. Axe runs on every screen in both themes. CI runs it. |
| P02-08 | Packaging smoke test | 3 | P02-03 | The arm64 `--dir` package starts, and `better-sqlite3` loads inside the packaged app. CI runs it. |

## Tests

- **Unit:** bridge validation, the recent-projects store, the window registry and the theme preference.
- **End-to-end:** open a project; switch to an open project and to a closed one; change the theme; navigate by keyboard; run axe.
- **Packaged smoke test:** start, render and load SQLite.

## Failure and recovery

- A deleted or moved folder appears as missing in the recent list, with **Locate** and **Remove**.
- A second app instance hands its folder to the first one.
- If the project service crashes, the window shows an error and restarts the service.

## Exit criteria

Every story is accepted, the end-to-end tests and packaging smoke test run in CI, and `docs/design-system.md` records how Voidra applies Ink & Iris.

## Hand-off

- Use the `ui-ux-pro-max` skill for design decisions, keeping the Ink & Iris palette, Inter and Lucide (D08).
- Read the storylens dashboard's `apps/dashboard/design-system/MASTER.md` before building components. If that checkout has moved, locate it without guessing or switching to the website's design system; request a decision with lettered options only if the source is unavailable.
