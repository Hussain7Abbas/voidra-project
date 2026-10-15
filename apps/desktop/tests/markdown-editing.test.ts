import { redo, undo } from "@codemirror/commands";
import type { Transaction } from "@codemirror/state";
import { expect, it } from "vitest";
import {
  createMarkdownState,
  rawPaste,
  rawSource,
  sourceSnapshot,
} from "../src/renderer/markdown-engine.ts";
import { markdownPresentation } from "../src/shared/markdown-presentation.ts";

it("renders syntax outside exactly the selected physical lines without changing source", () => {
  const source =
    "# Title **bold**\n**second**\n> third\n\n| One | Two |\n| --- | --- |\n| row | cell |\n\n```ts\nconst x=1\n```\n<script>unsafe()</script>";
  const preview = markdownPresentation(source, []);
  expect(preview.hidden.some((r) => source.slice(r.from, r.to) === "# ")).toBe(
    true,
  );
  expect(preview.marks.some((r) => r.className.includes("strong"))).toBe(true);
  expect(preview.lines.some((r) => r.className.includes("table"))).toBe(true);
  const from = source.indexOf("**second**"),
    to = source.indexOf("\n", from);
  const selected = markdownPresentation(source, [2]);
  expect(selected.hidden.some((r) => r.from < to && r.to > from)).toBe(false);
  expect(selected.marks.some((r) => r.from < to && r.to > from)).toBe(false);
  expect(selected.hidden.some((r) => r.from === 0)).toBe(true);
  const multiline = markdownPresentation(source, [1, 2, 3]);
  expect(multiline.hidden.every((r) => r.from >= source.indexOf("\n\n"))).toBe(
    true,
  );
  expect(
    preview.hidden.some((r) => source.slice(r.from, r.to).includes("<script>")),
  ).toBe(true);
  expect(
    markdownPresentation(source, [12]).hidden.some((r) =>
      source.slice(r.from, r.to).includes("<script>"),
    ),
  ).toBe(false);
});
it("preserves exact CRLF/mixed/pasted source across actual CodeMirror text undo and redo", () => {
  const source = "# Original\r\n🙂 line\nlast";
  let state = createMarkdownState(source);
  const target = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = tr.state;
    },
  };
  state = state.update({
    changes: { from: 2, to: 10, insert: "Changed" },
    userEvent: "input.type",
  }).state;
  expect(state.field(rawSource)).toBe(source.replace("Original", "Changed"));
  const before = state.field(rawSource),
    paste = "pasted\r\nnext\n";
  state = state.update({
    changes: { from: 0, insert: paste.replaceAll("\r\n", "\n") },
    annotations: rawPaste.of(paste),
    userEvent: "input.paste",
  }).state;
  expect(state.field(rawSource)).toBe(paste + before);
  expect(undo(target)).toBe(true);
  expect(state.field(rawSource)).toBe(before);
  expect(redo(target)).toBe(true);
  expect(state.field(rawSource)).toBe(paste + before);
  expect(undo(target)).toBe(true);
  expect(undo(target)).toBe(true);
  expect(state.field(rawSource)).toBe(source);
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: "External\nvalue" },
    effects: sourceSnapshot.of("External\r\nvalue"),
    userEvent: "input.external",
  }).state;
  expect(state.field(rawSource)).toBe("External\r\nvalue");
  expect(undo(target)).toBe(true);
  expect(state.field(rawSource)).toBe(source);
});
it("keeps nested lists, escapes, tables and large descriptions source-addressable", () => {
  const source =
    "- **parent**\n  - nested \\*literal\\*\n\n" +
    "paragraph **bold**\n".repeat(1000);
  const value = markdownPresentation(source, [2, 500]);
  expect(value.hidden.length).toBeGreaterThan(1000);
  expect(
    value.hidden.every(
      (r) => r.from >= 0 && r.to <= source.length && r.to > r.from,
    ),
  ).toBe(true);
  expect(createMarkdownState(source).field(rawSource)).toBe(source);
});
