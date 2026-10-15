# Markdown rendering and editing

The renderer uses one safe GFM viewer (`markdown-content.tsx`) and a source-based CodeMirror editor (`markdown-editor.tsx`). `SafeMarkdown` adds contained document navigation to the viewer. Stored values remain Markdown; rendered DOM is never serialized back to a record.

## Source coordinates and presentation

CodeMirror addresses LF-normalized UTF-16 offsets. `markdown-source.ts` maps these offsets to the original source, retaining untouched CRLF, CR and mixed separators. Typed line breaks follow the document's first separator. Plain-text paste keeps the pasted separators. A history state field stores the original source alongside each text transaction; undo and redo restore exact source snapshots.

The maintained Lezer GFM parser supplies syntax ranges. Decorations hide delimiters and apply presentation outside active physical source lines. The cursor reveals one line; a nonempty selection reveals intersected lines, excluding a next-line boundary that is only its end point. Multiline blocks do not expand the reveal beyond selected lines. Fence and table delimiter rows remain source-addressable boundary rows. Source soft breaks remain separate editor rows, keeping selection positions stable. Blurring formats all rows. Cursor-only movement uses CodeMirror’s indexed line lookup and reuses decorations while the revealed line set is unchanged, avoiding a full document parse for every arrow-key or in-line selection movement.

Viewer headings, lists, quotes, code, tables, strikethrough and disabled checklists use the shared sanitizer. Raw HTML never executes; images become alt text and external links remain inert. The editor creates text widgets and decorations, never HTML strings or navigable remote assets. Existing contained document links are opened only by the checked viewer navigation boundary.

## Desktop security and accessibility

Each served HTML document receives a fresh 24-byte style nonce. Only the exact nonce is added to `style-src`, so CodeMirror can install its style sheet under the existing CSP. Scripts still require their exact bootstrap hashes; no inline/eval, remote requests, frames or popup permissions are enabled. The nonce is not a credential or a reusable app-wide authorization.

Fields name the editable textbox with a visible label and retain hint/error associations. Focus stays in the source document as decorations change. Validation preserves invalid partial text. An editor initialization/rendering failure exposes the same controlled source in a labeled native textarea rather than discarding it.

## Ownership and persistence

The editor's `value`/`onChange` boundary owns Markdown source only. Its local text history is independent of persistent workspace undo. The native Edit menu first sends a cancelable command through the active control; the editor handles it with its own undo/redo, while ordinary native inputs retain Electron text editing. Explicit edits in a dialog support Cmd/Ctrl+S through the same enabled submit button and validation as clicking it; composition does not trigger submission. Changing `documentKey` creates a new editing session for a different logical document. A failed revision-guarded save leaves the controlled value available for retry and existing explicit overwrite review. Durable private form drafts are a separate shared form responsibility in V11-P04; text editing alone does not imply a canonical record write or approval.
