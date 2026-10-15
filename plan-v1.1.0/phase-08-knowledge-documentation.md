# V11-P08 — Markdown knowledge and documentation workspace

> **Needs:** P02, P07 · **Status:** Done — 2026-10-16 · **Proposal:** A05

## Outcome

Decisions and Glossary render Markdown correctly, and Documentation is a full page with a searchable directory tree and highlighted matches.

## Requirements

In scope: Markdown decision cards, intact glossary rendering, documentation page/tree, repository-document search, match counts/highlights, internal navigation and source refresh. Out of scope: editing immutable decisions/docs through a viewer or indexing arbitrary/private repository files.

## Blueprint

Replace plain-text decision excerpts with sanitized structured rendering; do not truncate raw Markdown in the middle of syntax. Preserve decision source, actor/date, assumption state, revisit controls and exact approval semantics. Glossary already uses SafeMarkdown, but its blank-paragraph search can break block syntax: preserve the parsed source/block structure while filtering or highlighting complete matches. Verify the user's reported failure with real examples before selecting a fix.

Replace modal-only DocumentViewerProvider navigation with a Documentation route, directory sidebar and rendered main page. Use the same contained `docs/**/*.md`/`GLOSSARY.md` policy, bounded UTF-8 reads and symlink refusal. Keep links to supported sources, open-in-editor behavior, current document path and back/forward history. The directory panel also toggles/resizes under the all-panels rule.

Provide a search scoped globally to supported project documents, not just the open file. Empty query shows the normal tree. A query filters to matching files, retains ancestor directories and shows per-file occurrence counts. Selecting a file displays safely highlighted visible text, current/total match position and next/previous navigation. Define literal case-insensitive matching and normalization once so counts agree with rendered highlights; avoid treating Markdown punctuation or hidden link URLs as visible matches without a stated policy. Preserve source text and query across file changes; tree and highlights refresh after external edits. Use a rebuildable index, never persist duplicate document source as planning data.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P08-01 | Decisions and Glossary Markdown | 5 | P02 | Representative lists, links, code, tables and headings render correctly on cards and Glossary; searching no longer corrupts blocks; read-only permissions remain. |
| V11-P08-02 | Documentation page/tree | 5 | P07 | A document link opens a full page with directory context, route history and editor action; its directory pane resizes/toggles; no read-only document modal remains the primary view. |
| V11-P08-03 | Global document search | 8 | 02 | Searching filters the tree with accurate file match counts; choosing a result highlights the same matches and supports next/previous without changing source. |
| V11-P08-04 | Refresh and document diagnostics | 3 | 03 | Added/edited/deleted files update tree/results; missing/oversized/invalid/escaping/symlink paths show useful errors and expose no unsupported content. |

## Tests

Real document trees, literal query punctuation/Unicode, nested folders, multiple occurrences, zero matches, filename versus body policy, fenced code and link labels. Assert count/highlight agreement and unchanged bytes. Electron navigation, query persistence, source links, stale search refresh, independent scrolling and both themes' contrast/axe.

## Failure and recovery

Unreadable pages keep directory/search usable and retain selection/query. Ignore obsolete async responses after navigation. Rebuild corrupted search caches without deleting undo history. Never broaden containment merely to make a broken link resolve.

## Exit criteria

All knowledge examples and document search acceptance checks pass with `make check` and actual Electron evidence. Documentation is a page, not a modal.

## Hand-off

Update knowledge architecture, directory/search semantics, read-only guidance and user guide. Audit all remaining Markdown-bearing surfaces for P10 coverage.
