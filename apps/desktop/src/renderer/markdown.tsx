import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { resolveDocumentLink } from "../shared/document-links.ts";
import { useOpenDocument } from "./document-viewer.tsx";
export function SafeMarkdown({
  body,
  source,
}: {
  body: string;
  source?: string;
}) {
  const open = useOpenDocument();
  return (
    <div className="markdown">
      <Markdown
        skipHtml
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
                onClick={() => open(path)}
              >
                {children}
              </button>
            ) : (
              <span title={href}>{children}</span>
            );
          },
          img: ({ alt }) => <span>{alt ? `Image: ${alt}` : "Image"}</span>,
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
