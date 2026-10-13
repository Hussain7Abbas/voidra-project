import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
export function SafeMarkdown({ body }: { body: string }) {
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
          a: ({ children, href }) => <span title={href}>{children}</span>,
          img: ({ alt }) => <span>{alt ? `Image: ${alt}` : "Image"}</span>,
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
