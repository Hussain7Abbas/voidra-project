import type { Element, Root, RootContent, Text } from "hast";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const blocks = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "pre",
  "blockquote",
  "tr",
  "td",
  "th",
  "hr",
  "br",
]);
/** Use identical visible image text in the utility and renderer. Raw HTML stays omitted. */
export function documentImages() {
  return (tree: Root): void => {
    function visit(node: Root | RootContent): void {
      if (node.type === "element" && node.tagName === "img") {
        const alt = node.properties.alt;
        node.tagName = "span";
        node.properties = {};
        node.children = [
          { type: "text", value: alt ? `Image: ${String(alt)}` : "Image" },
        ];
      }
      if ("children" in node) for (const child of node.children) visit(child);
    }
    visit(tree);
  };
}
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(documentImages);
export function documentTree(body: string): Root {
  return parser.runSync(parser.parse(body)) as Root;
}
interface Point {
  node: Text;
  offset: number;
  end: number;
}
interface SearchText {
  text: string;
  points: (Point | null)[];
}
/** Literal Unicode lowercase; collapse ordinary whitespace, keep block/cell boundaries. */
export function visibleDocumentText(tree: Root): SearchText {
  const chars: string[] = [];
  let previous = "";
  const points: (Point | null)[] = [];
  const boundary = () => {
    if (chars.length && previous !== "\n") {
      chars.push("\n");
      previous = "\n";
      points.push(null);
    }
  };
  function visit(node: Root | RootContent): void {
    if (node.type === "text") {
      let offset = 0;
      for (const char of node.value) {
        const lower = /\s/u.test(char) ? " " : char.toLowerCase();
        if (lower !== " " || (previous !== " " && previous !== "\n")) {
          chars.push(lower);
          previous = lower;
          for (let i = 0; i < lower.length; i++)
            points.push({ node, offset, end: offset + char.length });
        }
        offset += char.length;
      }
    } else if ("children" in node) {
      const block = node.type === "element" && blocks.has(node.tagName);
      if (block) boundary();
      for (const child of node.children) visit(child);
      if (block) boundary();
    }
  }
  visit(tree);
  return { text: chars.join(""), points };
}
export function documentQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/gu, " ").trim();
}
export function literalMatches(text: string, query: string): number[] {
  const needle = documentQuery(query),
    found: number[] = [];
  if (!needle) return found;
  for (
    let i = text.indexOf(needle);
    i !== -1;
    i = text.indexOf(needle, i + needle.length)
  )
    found.push(i);
  return found;
}
/** Transform the sanitized tree, preserving complete blocks and React ownership. */
export function documentHighlights(options: { query: string }) {
  return (tree: Root): void => {
    if (!documentQuery(options.query)) return;
    const source = visibleDocumentText(tree),
      needle = documentQuery(options.query),
      found = literalMatches(source.text, needle);
    const spans = new Map<
      Text,
      { start: number; end: number; match: number }[]
    >();
    for (const [match, position] of found.entries()) {
      for (let i = position; i < position + needle.length; i++) {
        const point = source.points[i];
        if (!point) continue;
        const list = spans.get(point.node) ?? [],
          last = list.at(-1);
        if (last && last.match === match && point.offset <= last.end)
          last.end = Math.max(last.end, point.end);
        else list.push({ start: point.offset, end: point.end, match });
        spans.set(point.node, list);
      }
    }
    function visit(node: Root | Element): void {
      node.children = node.children.flatMap((child): RootContent[] => {
        if (child.type === "element") visit(child);
        if (child.type !== "text") return [child];
        const list = spans.get(child);
        if (!list) return [child];
        const children: RootContent[] = [];
        let offset = 0;
        for (const span of list) {
          if (span.start > offset)
            children.push({
              type: "text",
              value: child.value.slice(offset, span.start),
            });
          children.push({
            type: "element",
            tagName: "mark",
            properties: { dataDocumentMatch: span.match },
            children: [
              { type: "text", value: child.value.slice(span.start, span.end) },
            ],
          });
          offset = span.end;
        }
        if (offset < child.value.length)
          children.push({ type: "text", value: child.value.slice(offset) });
        return children;
      }) as typeof node.children;
    }
    visit(tree);
  };
}
