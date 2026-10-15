import { memo } from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { resolveDocumentLink } from "../shared/document-links.ts";
import {
  documentHighlights,
  documentImages,
} from "../shared/document-search.ts";

/** Shared read-only policy: GFM, no raw HTML, no remote resources or arbitrary navigation. */
export const MarkdownContent = memo(function MarkdownContent({
  body,
  source,
  onOpen,
  search = "",
}: {
  body: string;
  search?: string;
  source?: string;
  onOpen?: (path: string) => void;
}) {
  return (
    <div className="markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSanitize,
          documentImages,
          [documentHighlights, { query: search }],
        ]}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h3>{children}</h3>,
          h5: ({ children }) => <h3>{children}</h3>,
          h6: ({ children }) => <h3>{children}</h3>,
          a: ({ children, href }) => {
            const path =
              source && href ? resolveDocumentLink(source, href) : null;
            return path ? (
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => onOpen?.(path)}
              >
                {children}
              </button>
            ) : (
              <span title={href}>{children}</span>
            );
          },
          img: ({ alt }) => <span>{alt ? `Image: ${alt}` : "Image"}</span>,
          input: ({ checked }) => (
            <input
              type="checkbox"
              disabled
              checked={checked ?? false}
              aria-label={
                checked
                  ? "Completed checklist item"
                  : "Incomplete checklist item"
              }
            />
          ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
});

/** Phrasing-only labels: render Markdown without nested links, buttons or form controls. */
export function InlineMarkdown({ body }: { body: string }) {
  return (
    <span className="inline-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        allowedElements={["strong", "em", "del", "code", "br", "img", "input"]}
        unwrapDisallowed
        components={{
          img: ({ alt }) => <span>{alt ?? "Image"}</span>,
          input: ({ checked }) => <span>{checked ? "[x]" : "[ ]"}</span>,
        }}
      >
        {body}
      </Markdown>
    </span>
  );
}
