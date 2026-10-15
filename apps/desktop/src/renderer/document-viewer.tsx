import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ExternalLink, PanelLeft } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { request, useSnapshot } from "./app.tsx";
import { flushFormDrafts } from "./form-drafts.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { Button } from "./ui/button.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";
import { PaneResize } from "./workspace-panels.tsx";

type Navigation = {
  path: string | null;
  open: (path: string) => Promise<boolean>;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  query: string;
  setQuery: (value: string) => void;
};
const documentContext = createContext<Navigation | null>(null);
export const useOpenDocument = (): ((path: string) => void) =>
  useContext(documentContext)?.open ?? (() => {});
export function DocumentViewerProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<{ paths: string[]; index: number }>({
      paths: [],
      index: -1,
    }),
    [query, setQuery] = useState(""),
    toast = useToast(),
    snapshot = useSnapshot(),
    root = snapshot.data?.project?.path;
  const currentRoot = useRef(root);
  currentRoot.current = root;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset private navigation when the registered project changes.
  useEffect(() => {
    setHistory({ paths: [], index: -1 });
    setQuery("");
  }, [root]);
  const open = useCallback(
    async (path: string): Promise<boolean> => {
      const context = currentRoot.current;
      try {
        await flushFormDrafts();
        if (currentRoot.current !== context) return false;
        setHistory((old) =>
          old.paths[old.index] === path
            ? old
            : {
                paths: [...old.paths.slice(0, old.index + 1), path],
                index: old.index + 1,
              },
        );
        window.dispatchEvent(new Event("voidra-open-document"));
        return true;
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Draft could not be saved",
        );
        return false;
      }
    },
    [toast],
  );
  return (
    <documentContext.Provider
      value={{
        path: history.paths[history.index] ?? null,
        open,
        back: () =>
          setHistory((old) => ({ ...old, index: Math.max(0, old.index - 1) })),
        forward: () =>
          setHistory((old) => ({
            ...old,
            index: Math.min(old.paths.length - 1, old.index + 1),
          })),
        canBack: history.index > 0,
        canForward: history.index < history.paths.length - 1,
        query,
        setQuery,
      }}
    >
      {children}
    </documentContext.Provider>
  );
}
interface DirectoryItem {
  path: string;
  matches: number;
}
function Directory({
  items,
  prefix = "",
  selected,
  query,
  open,
}: {
  items: DirectoryItem[];
  prefix?: string;
  selected: string | null;
  query: string;
  open: (path: string) => void;
}) {
  const folders = new Map<string, DirectoryItem[]>(),
    files: DirectoryItem[] = [];
  for (const item of items) {
    const rest = item.path.slice(prefix.length),
      slash = rest.indexOf("/");
    if (slash === -1) files.push(item);
    else {
      const name = rest.slice(0, slash + 1);
      folders.set(name, [...(folders.get(name) ?? []), item]);
    }
  }
  return (
    <ul className="document-tree">
      {[...folders].map(([name, children]) => (
        <li key={name}>
          <details open>
            <summary>{name.slice(0, -1)}</summary>
            <Directory
              items={children}
              prefix={prefix + name}
              selected={selected}
              query={query}
              open={open}
            />
          </details>
        </li>
      ))}
      {files.map((item) => (
        <li key={item.path}>
          <button
            type="button"
            title={item.path}
            aria-current={selected === item.path ? "page" : undefined}
            onClick={() => open(item.path)}
          >
            <span>{item.path.slice(prefix.length)}</span>
            {query.trim() && (
              <span
                role="img"
                className="badge"
                aria-label={`${item.matches} matches`}
              >
                {item.matches}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
export function DocumentationPage() {
  const nav = useContext(documentContext),
    snapshot = useSnapshot(),
    client = useQueryClient(),
    toast = useToast(),
    [q, setQ] = useState(nav?.query ?? ""),
    [active, setActive] = useState(0),
    [count, setCount] = useState(0),
    search = useRef<HTMLInputElement>(null),
    article = useRef<HTMLElement>(null),
    container = useRef<HTMLDivElement>(null),
    [available, setAvailable] = useState(600),
    [width, setWidth] = useState(
      snapshot.data?.layout.value.documentationWidth ?? 240,
    );
  const layout = snapshot.data?.layout,
    directoryOpen = layout?.value.documentationOpen ?? true;
  useEffect(() => {
    const timer = setTimeout(() => setQ(nav?.query ?? ""), 120);
    return () => clearTimeout(timer);
  }, [nav?.query]);
  useEffect(() => {
    if (layout) setWidth(layout.value.documentationWidth);
  }, [layout]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const find = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener("keydown", find);
    return () => window.removeEventListener("keydown", find);
  }, []);
  const directory = useQuery({
    queryKey: ["documents", snapshot.data?.project?.path, q],
    retry: false,
    queryFn: async () => {
      const result = await request({ command: "search-documents", q });
      if (result.kind !== "documents")
        throw Error("Unexpected directory response");
      return result;
    },
  });
  const path = nav?.path ?? null;
  const page = useQuery({
    queryKey: ["document", snapshot.data?.project?.path, path],
    enabled: !!path,
    retry: false,
    queryFn: async () => {
      if (!path) throw Error("Choose a document");
      const result = await request({ command: "read-document", path });
      if (result.kind !== "document")
        throw Error("Unexpected document response");
      return result.document;
    },
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Inspect committed Markdown only when its content or search changes.
  useEffect(() => {
    const markers =
      article.current?.querySelectorAll("[data-document-match]") ?? [];
    setCount(
      new Set(
        [...markers].map((node) => node.getAttribute("data-document-match")),
      ).size,
    );
    setActive(0);
  }, [page.data?.revision, path, q]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Inspect committed Markdown only when its content or search changes.
  useEffect(() => {
    const markers = article.current?.querySelectorAll<HTMLElement>(
      "[data-document-match]",
    );
    markers?.forEach((node) => {
      node.classList.toggle(
        "current-document-match",
        node.dataset.documentMatch === String(active),
      );
    });
  }, [active, q, page.data?.revision]);
  const move = (delta: number) => {
    const next = (active + delta + count) % count;
    setActive(next);
    article.current
      ?.querySelector(`[data-document-match="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };
  const save = async (patch: {
    documentationOpen?: boolean;
    documentationWidth?: number;
  }): Promise<boolean> => {
    if (!layout) return false;
    try {
      await request({
        command: "set-workspace-layout",
        context: layout.context,
        patch,
      });
      await client.invalidateQueries({ queryKey: ["snapshot"] });
      return true;
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not save directory layout",
      );
      return false;
    }
  };
  if (!nav) return null;
  const compact = available < 620,
    maximum = Math.max(180, Math.min(600, available - (compact ? 40 : 326))),
    fitted = Math.min(width, maximum);
  return (
    <section
      className="documentation-page"
      aria-label="Documentation workspace"
    >
      <div className="documentation-toolbar">
        <h1>Documentation</h1>
        <Button
          icon={<PanelLeft size={16} aria-hidden />}
          aria-controls="document-directory"
          aria-expanded={directoryOpen}
          onClick={() => {
            if (
              directoryOpen &&
              document
                .getElementById("document-directory")
                ?.contains(document.activeElement)
            )
              search.current?.focus();
            void save({ documentationOpen: !directoryOpen });
          }}
        >
          Directory
        </Button>
        <Button
          aria-label="Previous document"
          disabled={!nav.canBack}
          onClick={nav.back}
          icon={<ArrowLeft size={16} aria-hidden />}
        />
        <Button
          aria-label="Next document"
          disabled={!nav.canForward}
          onClick={nav.forward}
          icon={<ArrowRight size={16} aria-hidden />}
        />
        <label className="document-search">
          Search documentation
          <input
            ref={search}
            className="input"
            maxLength={256}
            value={nav.query}
            onChange={(event) => nav.setQuery(event.target.value)}
          />
        </label>
      </div>
      <div
        ref={container}
        className={`documentation-split ${compact ? "documentation-compact" : ""}`}
      >
        <div
          className="document-directory-wrap"
          hidden={!directoryOpen}
          style={{ width: fitted }}
        >
          <nav
            id="document-directory"
            aria-label="Document directory"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Directory diagnostics and empty results need keyboard scrolling.
            tabIndex={0}
          >
            {directory.isPending ? (
              <Spinner label="Reading document directory" />
            ) : directory.isError ? (
              <p role="alert">{directory.error.message}</p>
            ) : (
              <>
                <p className="text-sm text-muted" role="status">
                  {directory.data.items.length} files
                  {q.trim() ? " matching visible text" : ""}
                </p>
                <Directory
                  items={directory.data.items}
                  selected={path}
                  query={q}
                  open={(file) => {
                    void nav.open(file).then(async (opened) => {
                      if (
                        opened &&
                        compact &&
                        (await save({ documentationOpen: false }))
                      )
                        article.current?.focus({ preventScroll: true });
                    });
                  }}
                />
                {!directory.data.items.length && <p>No matching documents.</p>}
                {directory.data.problems.length > 0 && (
                  <section aria-label="Documentation problems">
                    <h2>Documents needing attention</h2>
                    <ul>
                      {directory.data.problems.map((problem) => (
                        <li key={problem.path}>
                          {problem.path}: {problem.message}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </nav>
          <PaneResize
            panel="navigation"
            label="Document directory"
            controls="document-directory"
            orientation="vertical"
            value={fitted}
            preferred={width}
            min={180}
            max={maximum}
            hidden={!directoryOpen}
            onPreview={setWidth}
            onSave={(documentationWidth) => {
              setWidth(documentationWidth);
              void save({ documentationWidth });
            }}
            onToggle={() => {
              search.current?.focus();
              void save({ documentationOpen: false });
            }}
          />
        </div>
        <article
          ref={article}
          className="document-page-body"
          aria-label="Document content"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The document is an independent keyboard scroller.
          tabIndex={0}
        >
          <h2 className="sr-only">Selected document</h2>
          <div className="document-page-actions">
            <p className="text-sm text-muted">{path ?? "Choose a document"}</p>
            <Button
              disabled={!page.data}
              icon={<ExternalLink size={16} aria-hidden />}
              onClick={() => {
                if (path)
                  void request({ command: "open-document-editor", path }).catch(
                    (cause) => toast.error(cause.message),
                  );
              }}
            >
              Open in editor
            </Button>
            {q.trim() && (
              <>
                <span role="status">
                  {count ? active + 1 : 0} / {count} matches
                </span>
                <Button disabled={!count} onClick={() => move(-1)}>
                  Previous match
                </Button>
                <Button disabled={!count} onClick={() => move(1)}>
                  Next match
                </Button>
              </>
            )}
          </div>
          {page.isError ? (
            <p role="alert">
              {page.error.message.includes("ENOENT")
                ? "This document is missing. Ask your agent to repair the link or create the page."
                : page.error.message}
            </p>
          ) : page.data ? (
            <SafeMarkdown
              body={page.data.body}
              source={page.data.path}
              search={q}
            />
          ) : path ? (
            <Spinner label="Opening document" />
          ) : (
            <p>Choose a document from the directory.</p>
          )}
        </article>
      </div>
    </section>
  );
}
