import { useOpenDocument } from "./document-viewer.tsx";
import { MarkdownContent } from "./markdown-content.tsx";
export function SafeMarkdown({
  body,
  source,
  search,
}: {
  body: string;
  source?: string;
  search?: string;
}) {
  const open = useOpenDocument();
  return (
    <MarkdownContent
      body={body}
      {...(search ? { search } : {})}
      {...(source ? { source } : {})}
      onOpen={open}
    />
  );
}
