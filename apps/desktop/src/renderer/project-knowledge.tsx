import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { KnowledgeEntry } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { useOpenDocument } from "./document-viewer.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { useWorkspace } from "./project-profile.tsx";
import { Button } from "./ui/button.tsx";
import { ConfirmDialog } from "./ui/confirm-dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

export function ProjectDecisions({
  onAction,
  onProfile,
}: {
  onAction: (id: string) => void;
  onProfile: () => void;
}) {
  const workspace = useWorkspace(),
    query = useQueryClient(),
    toast = useToast(),
    open = useOpenDocument();
  const [q, setQ] = useState(""),
    [kind, setKind] = useState<
      "all" | "question" | "plan" | "adr" | "assumption"
    >("all"),
    [action, setAction] = useState(""),
    [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [offset, setOffset] = useState(0),
    [revisit, setRevisit] = useState<KnowledgeEntry | null>(null),
    [busy, setBusy] = useState(false);
  const results = useQuery({
    queryKey: ["decisions", q, kind, action, from, through, offset],
    queryFn: async () => {
      const result = await request({
        command: "search-decisions",
        q,
        kind,
        limit: 50,
        offset,
        ...(action ? { action } : {}),
        ...(from ? { from } : {}),
        ...(through ? { through } : {}),
      });
      if (result.kind !== "decisions")
        throw new Error("Unexpected decision response");
      return result;
    },
  });
  const create = async (): Promise<void> => {
    if (!revisit) return;
    setBusy(true);
    const existing = new Set(
      workspace.data?.actions.map((action) => action.data.id),
    );
    try {
      const result = await request({
        command: "revisit-assumption",
        id: revisit.id,
        revision: revisit.revision,
      });
      await query.invalidateQueries();
      if (result.kind === "workspace") {
        const created = result.workspace.actions.find(
          (a) =>
            !existing.has(a.data.id) &&
            a.data.title === `Revisit: ${revisit.title}`.slice(0, 160),
        );
        if (created) onAction(created.data.id);
      }
      setRevisit(null);
      toast.success("Created an action to revisit this assumption");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please try again.");
      await query.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };
  const source = (entry: KnowledgeEntry): void => {
    if (entry.kind === "adr") open(entry.path);
    else if (entry.action) onAction(entry.action);
    else onProfile();
  };
  return (
    <>
      <PageHeader
        title="Decisions"
        description="Find the choices and assumptions behind your project."
      />
      <section className="card action-detail" aria-label="Decision search">
        <label>
          Search decisions
          <input
            className="input"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        <div className="flex flex-wrap gap-3 mt-3">
          <Field label="Decision kind">
            <select
              className="input"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as typeof kind);
                setOffset(0);
              }}
            >
              <option value="all">All kinds</option>
              <option value="question">Questions</option>
              <option value="plan">Approved plans</option>
              <option value="adr">Architecture decisions</option>
              <option value="assumption">Assumptions</option>
            </select>
          </Field>
          <Field label="Action">
            <select
              className="input"
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All actions</option>
              {workspace.data?.actions.map((a) => (
                <option key={a.data.id} value={a.data.id}>
                  {a.data.title}
                </option>
              ))}
            </select>
          </Field>
          <label>
            From date
            <input
              className="input"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label>
            Through date
            <input
              className="input"
              type="date"
              value={through}
              onChange={(event) => {
                setThrough(event.target.value);
                setOffset(0);
              }}
            />
          </label>
        </div>
      </section>
      {results.isPending ? (
        <Spinner label="Searching decisions" />
      ) : results.isError ? (
        <ErrorState
          error={results.error}
          onRetry={() => void results.refetch()}
        />
      ) : (
        <>
          <p className="text-sm text-muted" role="status">
            {results.data.total} matching{" "}
            {results.data.total === 1 ? "record" : "records"}
          </p>
          {results.data.problems.length > 0 && (
            <section className="service-notice" aria-label="Document problems">
              <h2>Documents needing attention</h2>
              <ul>
                {results.data.problems.map((problem) => (
                  <li key={problem.path}>
                    {problem.path}: {problem.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {results.data.items.map((entry) => (
            <article className="card action-detail" key={entry.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2>{entry.title}</h2>
                <span className="badge">
                  {entry.assumed
                    ? "Assumption"
                    : entry.kind === "adr"
                      ? "Architecture decision"
                      : entry.kind === "plan"
                        ? "Approved plan"
                        : "Answered question"}
                </span>
                {entry.state !== "recorded" && (
                  <span className="badge">
                    {entry.state === "pending"
                      ? "Agent choice pending"
                      : "Approval needs renewal"}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">
                {entry.by ?? "Author not recorded"}
                {entry.at
                  ? ` · ${entry.at.length === 10 ? entry.at : new Date(entry.at).toLocaleString()}`
                  : ""}
              </p>
              <p className="whitespace-pre-wrap text-sm">
                {entry.text.length > 1200
                  ? `${entry.text.slice(0, 1200)}…`
                  : entry.text}
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="ghost"
                  icon={<BookOpen size={16} aria-hidden />}
                  aria-label={`Open source: ${entry.title}`}
                  onClick={() => source(entry)}
                >
                  Open source
                </Button>
                {entry.assumed && (
                  <Button
                    variant="ghost"
                    icon={<RotateCcw size={16} aria-hidden />}
                    aria-label={`Revisit assumption: ${entry.title}`}
                    disabled={
                      busy ||
                      entry.state === "pending" ||
                      workspace.data?.readOnly ||
                      workspace.data?.lock.state !== "none" ||
                      !!workspace.data?.recoveries.length
                    }
                    onClick={() => setRevisit(entry)}
                  >
                    Revisit assumption
                  </Button>
                )}
              </div>
            </article>
          ))}
          {!results.data.total && (
            <section className="card action-detail">
              <h2>No matching decisions</h2>
              <p>Try a different word or clear a filter.</p>
            </section>
          )}
          {results.data.total > 50 && (
            <div className="flex gap-2">
              <Button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <Button
                disabled={offset + 50 >= results.data.total}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={revisit !== null}
        title="Revisit this assumption?"
        confirmLabel={
          revisit?.kind === "profile"
            ? "Create Profile change draft"
            : "Create Research action"
        }
        tone="primary"
        busy={busy}
        onClose={() => setRevisit(null)}
        onConfirm={() => void create()}
      >
        {revisit?.kind === "profile"
          ? "Create a draft Profile change to review the assumption and its impact."
          : "Create a linked Research action to re-evaluate the earlier choice."}
      </ConfirmDialog>
    </>
  );
}
export function ProjectGlossary() {
  const [search, setSearch] = useState("");
  const document = useQuery({
    queryKey: ["document", "GLOSSARY.md"],
    retry: false,
    queryFn: async () => {
      const result = await request({
        command: "read-document",
        path: "GLOSSARY.md",
      });
      if (result.kind !== "document")
        throw new Error("Unexpected glossary response");
      return result.document;
    },
  });
  const blocks =
    document.data?.body
      .split(/\n\s*\n/)
      .filter(
        (block) =>
          !search || block.toLowerCase().includes(search.toLowerCase()),
      )
      .join("\n\n") ?? "";
  return (
    <>
      <PageHeader
        title="Glossary"
        description="Search the terms your team uses. Terms change through actions."
      />
      <section className="card action-detail">
        <label>
          Search glossary
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>
      {document.isPending ? (
        <Spinner label="Reading glossary" />
      ) : document.isError ? (
        <section className="card action-detail">
          <h2>Glossary unavailable</h2>
          <p>
            {document.error.message.includes("ENOENT")
              ? "Ask your agent to create GLOSSARY.md through a Docs action."
              : document.error.message}
          </p>
          <Button onClick={() => void document.refetch()}>
            Reload glossary
          </Button>
        </section>
      ) : (
        <section className="card action-detail">
          {blocks ? (
            <SafeMarkdown body={blocks} source="GLOSSARY.md" />
          ) : (
            <p>No matching terms.</p>
          )}
        </section>
      )}
    </>
  );
}
