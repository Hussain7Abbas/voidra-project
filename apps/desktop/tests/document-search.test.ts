import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentIndex } from "../src/project-service/documents.ts";
import { MarkdownContent } from "../src/renderer/markdown-content.tsx";
import {
  documentTree,
  literalMatches,
  visibleDocumentText,
} from "../src/shared/document-search.ts";

it("counts the same complete visible Markdown matches that the renderer highlights", () => {
  const body =
    "# Knowledge\n\nalpha **BETA**, alpha BETA. [label](https://hidden.invalid/secret)\n\n![diagram](https://hidden.invalid/image)\n\n```txt\nA.*B\nİ🙂\n```\n\n| Term | Meaning |\n| --- | --- |\n| alpha | BETA |\n\n<script>secret</script>\n";
  const text = visibleDocumentText(documentTree(body)).text;
  for (const [query, expected] of [
    ["alpha beta", 2],
    ["A.*B", 1],
    ["label", 1],
    ["hidden", 0],
    ["secret", 0],
    ["Image: diagram", 1],
    ["İ🙂", 1],
    ["alpha\nBETA", 2],
    ["[", 0],
  ] as const) {
    expect(literalMatches(text, query), query).toHaveLength(expected);
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { body, search: query }),
    );
    const ordinals = [...html.matchAll(/data-document-match="(\d+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(ordinals).size, query).toBe(expected);
    expect(html).not.toContain("<script");
    expect(html).toContain("<table>");
    expect(html).toContain("<pre>");
  }
  expect(
    renderToStaticMarkup(createElement(MarkdownContent, { body, search: "İ" })),
  ).toContain(">İ</mark>");
});
it("lazily indexes only contained public documents and rebuilds after edits, additions and deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-document-index-"));
  try {
    const index = new DocumentIndex(root);
    await mkdir(join(root, "docs/nested"), { recursive: true });
    await writeFile(
      join(root, "docs/nested/page.md"),
      "# Start\n\nneedle **word** needle word\n",
    );
    await writeFile(join(root, "GLOSSARY.md"), "# Terms\n\nNeedle\n");
    await writeFile(join(root, "private.md"), "needle");
    await writeFile(join(root, "docs/bad.md"), Buffer.from([255]));
    await writeFile(join(root, "docs/huge.md"), "x".repeat(262145));
    await symlink(join(root, "private.md"), join(root, "docs/linked.md"));
    let result = await index.search("needle word");
    expect(result.items).toMatchObject([
      { path: "docs/nested/page.md", matches: 2 },
    ]);
    expect(result.problems.map((problem) => problem.path).sort()).toEqual([
      "docs/bad.md",
      "docs/huge.md",
      "docs/linked.md",
    ]);
    expect((await index.search("nested")).items).toEqual([]);
    await writeFile(join(root, "docs/new.md"), "new needle");
    await rm(join(root, "docs/nested/page.md"));
    index.invalidate();
    result = await index.search("needle");
    expect(result.items.map((item) => item.path)).toEqual([
      "GLOSSARY.md",
      "docs/new.md",
    ]);
    expect((await index.search("missing")).items).toEqual([]);
    expect((await index.search("")).items).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps contextual Greek and expanding Unicode case mappings aligned with highlight positions", () => {
  const body = "# Unicode\n\nΟΣ ος οσ İ🙂\n";
  const text = visibleDocumentText(documentTree(body)).text;
  for (const [query, count] of [
    ["ΟΣ", 3],
    ["ος", 3],
    ["οσ", 3],
    ["İ🙂", 1],
  ] as const) {
    expect(literalMatches(text, query)).toHaveLength(count);
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { body, search: query }),
    );
    expect(
      new Set(
        [...html.matchAll(/data-document-match="(\d+)"/g)].map(
          (match) => match[1],
        ),
      ).size,
    ).toBe(count);
  }
});
