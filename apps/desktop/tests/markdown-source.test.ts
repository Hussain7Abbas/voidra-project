import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  InlineMarkdown,
  MarkdownContent,
} from "../src/renderer/markdown-content.tsx";
import {
  applySourceChanges,
  editorOffset,
  normalizeSource,
  selectedLines,
  sourceOffset,
} from "../src/shared/markdown-source.ts";

it("round-trips mixed physical line endings and Unicode without rewriting untouched source", () => {
  const source = "# Heading\r\n🙂 **bold**\n\r\nlast\rfinal";
  expect(normalizeSource(source)).toBe("# Heading\n🙂 **bold**\n\nlast\nfinal");
  for (let pos = 0; pos <= normalizeSource(source).length; pos++)
    expect(editorOffset(source, sourceOffset(source, pos))).toBe(pos);
  expect(applySourceChanges(source, [])).toBe(source);
  const from = normalizeSource(source).indexOf("bold");
  expect(
    applySourceChanges(source, [{ from, to: from + 4, insert: "strong" }]),
  ).toBe(source.replace("bold", "strong"));
  expect(
    applySourceChanges(source, [{ from: 0, to: 0, insert: "first\n" }]),
  ).toBe(`first\r\n${source}`);
  expect(
    applySourceChanges(source, [
      { from: 0, to: 0, insert: "pasted\r\nline\n", raw: true },
    ]),
  ).toBe(`pasted\r\nline\n${source}`);
});
it("reveals physical lines intersecting selections, keeping an exclusive next-line endpoint rendered", () => {
  const source = "one\n🙂 two\n\nlast";
  expect(selectedLines(source, [{ from: 5, to: 5 }])).toEqual([2]);
  expect(selectedLines(source, [{ from: 0, to: 4 }])).toEqual([1]);
  expect(selectedLines(source, [{ from: 0, to: 12 }])).toEqual([1, 2, 3]);
  expect(
    selectedLines(source, [
      { from: 0, to: 1 },
      { from: source.length, to: source.length },
    ]),
  ).toEqual([1, 4]);
});
it("uses one safe GFM viewer policy for tables, checklists and hostile HTML/URLs without remote images", () => {
  const body =
    "# Heading\n\n| One | Two |\n| --- | --- |\n| cell | **bold** |\n\n- [x] Done\n\n[unsafe](javascript:alert(1))\n\n![alt](https://remote.invalid/pixel)\n\n<script>alert('unsafe')</script>\n";
  const html = renderToStaticMarkup(createElement(MarkdownContent, { body }));
  expect(html).toContain("<table>");
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain('type="checkbox"');
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("remote.invalid");
  expect(body).toContain("<script>");
});

it("keeps Markdown control labels phrasing-only and strips nested navigation/resources", () => {
  const html = renderToStaticMarkup(
    createElement(InlineMarkdown, {
      body: "**Scope** with [a link](https://example.test) ![diagram](https://example.test/image.png)\n\n- [x] confirmed\n<script>unsafe()</script>",
    }),
  );
  expect(html).toContain("<strong>Scope</strong>");
  expect(html).toContain("a link");
  expect(html).toContain("diagram");
  expect(html).not.toMatch(/<(?:a|button|input|img|p|ul|li|script)[\s>]/);
  expect(html).not.toContain("https://example.test");
});
