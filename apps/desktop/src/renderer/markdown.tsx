import { useOpenDocument } from "./document-viewer.tsx";
import { MarkdownContent } from "./markdown-content.tsx";
export function SafeMarkdown({
  body,
  source,
}: {
  body: string;
  source?: string;
}) {
  const open = useOpenDocument();
  return (
    <MarkdownContent
      body={body}
      {...(source ? { source } : {})}
      onOpen={open}
    />
  );
}
