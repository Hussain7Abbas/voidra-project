# V11-P02 — Markdown rendering and editing in place

> **Needs:** P01 · **Status:** Not started

## Outcome

Markdown fields render inside the editing surface and reveal source only for the cursor line or selected lines.

## Requirements

In scope: a shared Markdown viewer/editor contract, active-line source reveal, multiline selection and adoption in an existing task description. Out of scope: granting new edit rights to repository documents or approval records; a separate preview tab is not the requested interaction.

## Blueprint

Treat “WAYSWING” as the user's interaction term, not a prescribed package. Evaluate a maintained source-based editor with decoration support against the pinned Electron runtime before selecting it. Preserve Markdown bytes as the canonical value; rendering is a view, not a conversion to HTML storage.

With a collapsed cursor, reveal that physical source line. With a multiline selection, reveal all intersected source lines; leaving them returns them to rendered presentation. Keep surrounding lines rendered, with stable cursor/selection mappings for headings, lists, links, tables, code fences and multiline blocks. Define block-boundary behavior explicitly without broadening source reveal to an entire document.

Use the same sanitized Markdown policy for viewers and editors, including task descriptions, profile prose, question/answer text, plan/review prose and knowledge. Plain titles, member names and version numbers remain plain inputs. Immutable/gated content uses the viewer only. Preserve supported contained document links and the current CSP; do not load remote assets from Markdown.

## Stories

| ID | Story | Points | Needs | Acceptance |
| --- | --- | --- | --- | --- |
| V11-P02-01 | Shared rendering and source model | 3 | P01 | Given headings/lists/code/tables/links, viewer output is sanitized and source round-trips without rewriting stored bytes. |
| V11-P02-02 | Cursor and selection reveal | 8 | 01 | Given a rendered description, placing the cursor reveals that line; selecting across lines reveals those lines; moving away renders them again without losing selection or text. |
| V11-P02-03 | Native editing behavior | 5 | 02 | Typing, paste, cut, undo/redo, keyboard selection and IME composition preserve source and focus; local text undo does not undo another project record. |
| V11-P02-04 | Adopt in task descriptions | 5 | 03 | A description opens in the new default editor, saves through revision guards, and reports external edits while retaining the user's draft. |

## Tests

Source/selection mapping tests and real Electron editing workflows covering Unicode, blank lines, CRLF, fences, nested lists, tables, large documents, search marks, malicious Markdown and clipboard plain-text Markdown. Verify light/dark contrast, screen-reader naming and keyboard focus while changing render mode. Test text undo separately from persisted workspace undo.

## Failure and recovery

An editor/render failure preserves recoverable source text. Never discard draft bytes or auto-save a render conversion. External revision mismatches use existing reload/explicit-overwrite behavior. The user discarded the incomplete `~` instruction; it adds no acceptance requirement.

## Exit criteria

Cursor and multiline behavior are demonstrated in Electron, not just a static preview. All stories and `make check` pass; document actual evidence at completion.

## Hand-off

Document the component contract, sanitizer, selection behavior, draft lifecycle and undo routing. P04/P07/P08 reuse it; they must not introduce their own Markdown dialects or raw-text card renderers.
