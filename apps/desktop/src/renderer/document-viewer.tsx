import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { request } from "./app.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

const openDocumentContext = createContext<(path: string) => void>(() => {});
export const useOpenDocument = (): ((path: string) => void) =>
  useContext(openDocumentContext);
export function DocumentViewerProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string | null>(null),
    [opening, setOpening] = useState(false),
    toast = useToast();
  const document = useQuery({
    queryKey: ["document", path],
    enabled: path !== null,
    retry: false,
    queryFn: async () => {
      if (!path) throw new Error("Choose a document");
      const result = await request({ command: "read-document", path });
      if (result.kind !== "document")
        throw new Error("Unexpected document response");
      return result.document;
    },
  });
  const editor = async (): Promise<void> => {
    if (!path) return;
    setOpening(true);
    try {
      await request({ command: "open-document-editor", path });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open this file.",
      );
    } finally {
      setOpening(false);
    }
  };
  return (
    <openDocumentContext.Provider value={setPath}>
      {children}
      <Dialog
        open={path !== null}
        onClose={() => setPath(null)}
        title={document.data?.title ?? "Document"}
        size="lg"
        footer={
          <>
            <Button
              icon={<ExternalLink size={16} aria-hidden />}
              loading={opening}
              onClick={() => void editor()}
            >
              Open in editor
            </Button>
            <Button onClick={() => setPath(null)}>Done</Button>
          </>
        }
      >
        <p className="text-sm text-muted">{path}</p>
        {document.isPending ? (
          <Spinner label="Opening document" />
        ) : document.isError ? (
          <p role="alert" className="field-error">
            {document.error.message.includes("ENOENT")
              ? "This document is missing. Ask your agent to repair the link or create the page."
              : document.error.message}
          </p>
        ) : document.data ? (
          <SafeMarkdown body={document.data.body} source={document.data.path} />
        ) : null}
      </Dialog>
    </openDocumentContext.Provider>
  );
}
