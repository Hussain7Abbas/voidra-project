import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { resolveDocumentLink } from "../shared/document-links.ts";

/** Shared read-only policy: GFM, no raw HTML, no remote resources or arbitrary navigation. */
export function MarkdownContent({
  body,
  source,
  onOpen,
}: {
  body: string;
  source?: string;
  onOpen?: (path: string) => void;
}) {
  return (
    <div className="markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
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
}
