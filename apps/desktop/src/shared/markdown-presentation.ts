import { GFM, parser } from "@lezer/markdown";
import { decodeString } from "micromark-util-decode-string";
import { normalizeSource } from "./markdown-source.ts";

interface Span {
  from: number;
  to: number;
}
export interface MarkdownPresentation {
  hidden: Span[];
  marks: (Span & { className: string })[];
  lines: { from: number; number: number; className: string }[];
  widgets: { from: number; to: number; text: string }[];
}
const grammar = parser.configure(GFM);

/** Presentation only: all coordinates address the normalized source, never rendered HTML. */
export function markdownPresentation(
  source: string,
  active: readonly number[],
): MarkdownPresentation {
  const text = normalizeSource(source),
    excluded = new Set(active);
  const physical = text.split("\n"),
    starts: number[] = [];
  let offset = 0;
  for (const line of physical) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const lineAt = (pos: number): number => {
    let low = 0,
      high = starts.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if ((starts[mid] ?? 0) <= pos) low = mid;
      else high = mid;
    }
    return low;
  };
  const output: MarkdownPresentation = {
    hidden: [],
    marks: [],
    lines: [],
    widgets: [],
  };
  const classes = new Map<number, Set<string>>(),
    ordered = new Map<number, number>();
  const each = (
    from: number,
    to: number,
    add: (from: number, to: number) => void,
  ): void => {
    for (
      let index = lineAt(from);
      index <= lineAt(Math.max(from, to - 1));
      index++
    ) {
      if (excluded.has(index + 1)) continue;
      const start = Math.max(from, starts[index] ?? 0),
        end = Math.min(
          to,
          (starts[index] ?? 0) + (physical[index]?.length ?? 0),
        );
      if (end > start) add(start, end);
    }
  };
  const hide = (from: number, to: number): void =>
    each(from, to, (from, to) => output.hidden.push({ from, to }));
  const mark = (from: number, to: number, className: string): void =>
    each(from, to, (from, to) => output.marks.push({ from, to, className }));
  const lines = (from: number, to: number, name: string): void => {
    for (
      let index = lineAt(from);
      index <= lineAt(Math.max(from, to - 1));
      index++
    ) {
      if (excluded.has(index + 1)) continue;
      const value = classes.get(index) ?? new Set<string>();
      value.add(name);
      classes.set(index, value);
    }
  };
  const widget = (from: number, to: number, value: string): void => {
    if (excluded.has(lineAt(from) + 1)) return;
    output.widgets.push({ from, to, text: value });
  };
  grammar.parse(text).iterate({
    enter(ref) {
      const { from, to, name } = ref,
        node = ref.node,
        parent = node.parent?.name ?? "";
      if (name === "OrderedList")
        ordered.set(from, Number(text.slice(from, to).match(/^\d+/)?.[0] ?? 1));
      if (/^ATXHeading[1-6]$|^SetextHeading[12]$/.test(name))
        lines(from, to, "cm-md-heading");
      if (name === "HeaderMark") hide(from, to + (text[to] === " " ? 1 : 0));
      if (name === "StrongEmphasis") mark(from, to, "cm-md-strong");
      if (name === "Emphasis") mark(from, to, "cm-md-emphasis");
      if (name === "Strikethrough") mark(from, to, "cm-md-strike");
      if (name === "InlineCode") mark(from, to, "cm-md-inline-code");
      if (
        [
          "EmphasisMark",
          "StrikethroughMark",
          "CodeMark",
          "CodeInfo",
          "LinkMark",
        ].includes(name)
      )
        hide(from, to);
      if (name === "URL" || name === "LinkTitle") {
        if (parent === "Link" || parent === "Image") hide(from, to);
      }
      if (name === "Link" || name === "Autolink") mark(from, to, "cm-md-link");
      if (name === "Image") widget(from, from, "Image: ");
      if (name === "ListMark") {
        const list = node.parent?.parent;
        let content = "•";
        if (list?.name === "OrderedList") {
          const count = ordered.get(list.from) ?? 1;
          ordered.set(list.from, count + 1);
          content = `${count}.`;
        }
        if (node.parent?.getChild("Task")) content = "";
        hide(from, to);
        if (content) widget(from, from, content);
      }
      if (name === "TaskMarker") {
        hide(from, to);
        widget(
          from,
          from,
          text.slice(from, to).toLowerCase().includes("x") ? "☑" : "☐",
        );
      }
      if (name === "Blockquote") lines(from, to, "cm-md-quote");
      if (name === "QuoteMark") hide(from, to + (text[to] === " " ? 1 : 0));
      if (name === "FencedCode" || name === "IndentedCode")
        lines(from, to, "cm-md-code");
      if (name === "Table") lines(from, to, "cm-md-table");
      if (name === "TableHeader") mark(from, to, "cm-md-table-header");
      if (name === "TableCell") mark(from, to, "cm-md-table-cell");
      if (name === "TableDelimiter") hide(from, to);
      if (name === "Escape") {
        hide(from, from + 1);
      }
      if (name === "Entity") {
        hide(from, to);
        widget(from, from, decodeString(text.slice(from, to)));
      }
      if (
        [
          "HTMLBlock",
          "HTMLTag",
          "CommentBlock",
          "ProcessingInstructionBlock",
        ].includes(name)
      )
        hide(from, to);
      if (name === "HorizontalRule") {
        hide(from, to);
        widget(from, from, "────────");
      }
    },
  });
  for (let index = 0; index < physical.length; index++) {
    const names = classes.get(index) ?? new Set<string>();
    if (excluded.has(index + 1)) names.add("cm-md-source");
    if (names.size)
      output.lines.push({
        from: starts[index] ?? 0,
        number: index + 1,
        className: [...names].join(" "),
      });
  }
  output.hidden.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Span[] = [];
  for (const span of output.hidden) {
    const previous = merged.at(-1);
    if (previous && span.from <= previous.to)
      previous.to = Math.max(previous.to, span.to);
    else merged.push({ ...span });
  }
  output.hidden = merged;
  return output;
}
