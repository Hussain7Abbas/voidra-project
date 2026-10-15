import { listProjectDocuments } from "voidra";
import {
  documentTree,
  literalMatches,
  visibleDocumentText,
} from "../shared/document-search.ts";

/** Lazy and disposable; never adds document parsing to Tasks startup. */
export class DocumentIndex {
  private cached: Promise<Awaited<ReturnType<DocumentIndex["build"]>>> | null =
    null;
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  invalidate(): void {
    this.cached = null;
  }
  private async build() {
    const result = await listProjectDocuments(this.root),
      entries = [];
    for (const doc of result.entries) {
      entries.push({
        path: doc.path,
        title: doc.title,
        revision: doc.revision,
        text: visibleDocumentText(documentTree(doc.body)).text,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return { entries, problems: result.problems };
  }
  async search(q: string): Promise<{
    kind: "documents";
    items: { path: string; title: string; revision: string; matches: number }[];
    problems: { path: string; message: string }[];
  }> {
    this.cached ??= this.build().catch((error) => {
      this.cached = null;
      throw error;
    });
    const current = this.cached,
      result = await current;
    if (this.cached !== current) return this.search(q);
    return {
      kind: "documents" as const,
      items: result.entries.flatMap(({ text, ...doc }) => {
        const matches = literalMatches(text, q).length;
        return !q.trim() || matches ? [{ ...doc, matches }] : [];
      }),
      problems: result.problems,
    };
  }
}
