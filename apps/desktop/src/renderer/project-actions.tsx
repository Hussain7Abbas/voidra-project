"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { request } from "./app.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";
export function ProjectActions({ view }: { view: "actions" | "run" }) {
  const query = useQueryClient(),
    toast = useToast();
  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const result = await request({ command: "workspace" });
      if (result.kind !== "workspace")
        throw new Error("Unexpected project response");
      return result.workspace;
    },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<"run" | "operation" | null>(null),
    [recoveryId, setRecoveryId] = useState("");
  const [reject, setReject] = useState(false),
    [feedback, setFeedback] = useState("");
  const [create, setCreate] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (workspace.isPending) return <Spinner label="Loading planning records" />;
  if (workspace.isError)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  const data = workspace.data;
  const problems = data.diagnostics.length ? (
    <section className="service-notice" aria-label="Planning file problems">
      <h2>Planning files need attention</h2>
      <ul>
        {data.diagnostics.map((d) => (
          <li key={`${d.file}:${d.field}:${d.code}`}>
            <code>
              {d.file}:{d.line} · {d.field}
            </code>
            <p>{d.message}</p>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
  const recoveryPanel = (
    <>
      <section className="card action-detail" aria-label="Run recovery">
        {data.recoveries.map((item) => (
          <div key={`${item.kind}:${item.id}`} className="recovery-row">
            <p>{item.message}</p>
            <code>{item.id}</code>
            {item.recoverable ? (
              <Button
                className="mt-3"
                onClick={() => {
                  setRecovery(item.kind);
                  setRecoveryId(item.id);
                }}
              >
                {item.kind === "run" ? "Recover run" : "Recover write"}
              </Button>
            ) : (
              <p className="text-muted">
                Recovery waits until the owner stops and can be verified.
              </p>
            )}
          </div>
        ))}
      </section>
      <Dialog
        open={recovery !== null}
        onClose={() => setRecovery(null)}
        title={recovery === "run" ? "Recover run" : "Recover interrupted write"}
        description="Your coding agent checks ownership, preserves outside edits and completes the recovery."
        footer={<Button onClick={() => setRecovery(null)}>Done</Button>}
      >
        <p>
          Copy the command into your agent. A live owner’s lock cannot be
          cleared.
        </p>
        {(["claude-code", "codex"] as const).map((agent) => (
          <div key={agent} className="command-row">
            <code>
              {agent === "claude-code" ? "/voidra-go" : "$voidra-go"} recover{" "}
              {recovery} {recoveryId}
            </code>
            <Button
              onClick={() => {
                if (recovery)
                  void request({
                    command: "copy-recovery-command",
                    agent,
                    kind: recovery,
                    id: recoveryId,
                  })
                    .then(() => toast.success("Recovery command copied"))
                    .catch((e) => toast.error(e.message));
              }}
            >
              {agent === "claude-code"
                ? "Copy Claude Code recovery"
                : "Copy Codex recovery"}
            </Button>
          </div>
        ))}
      </Dialog>
    </>
  );
  if (view === "run")
    return (
      <>
        <PageHeader
          title="Run"
          description="Queue the work, then run the command in your coding agent."
        />
        {problems}
        {data.recoveries.length > 0 && recoveryPanel}
        <section className="card action-detail" aria-label="Run queue">
          <h2>Queued actions</h2>
          {data.queue.length ? (
            <ol>
              {data.queue.map((id) => (
                <li key={id}>
                  {data.actions.find((action) => action.data.id === id)?.data
                    .title ?? id}
                </li>
              ))}
            </ol>
          ) : (
            <p>Choose an action to queue.</p>
          )}
        </section>
        <section className="card action-detail" aria-label="Agent status">
          <h2>Agent status</h2>
          <p
            role={
              data.lock.state === "none" || data.lock.state === "running"
                ? "status"
                : "alert"
            }
          >
            {data.lock.message}
          </p>
        </section>
        <section className="card action-detail" aria-label="Agent commands">
          <h2>Run in your agent</h2>
          {(["claude-code", "codex"] as const).map((agent) => (
            <div className="command-row" key={agent}>
              <div>
                <h3>{agent === "claude-code" ? "Claude Code" : "Codex"}</h3>
                <code>
                  {agent === "claude-code" ? "/voidra-go" : "$voidra-go"}
                </code>
              </div>
              <Button
                onClick={() =>
                  void request({ command: "copy-agent-command", agent })
                    .then(() => toast.success("Command copied"))
                    .catch((e) => toast.error(e.message))
                }
              >
                {agent === "claude-code"
                  ? "Copy Claude Code command"
                  : "Copy Codex command"}
              </Button>
            </div>
          ))}
        </section>
      </>
    );
  const current = data.actions.find((action) => action.data.id === selected);
  if (selected && !current)
    return (
      <>
        <Button className="mb-6" onClick={() => setSelected(null)}>
          Back to actions
        </Button>
        <PageHeader
          title="Action file needs attention"
          description={selected}
        />
        {problems}
      </>
    );
  if (current)
    return (
      <>
        <Button
          className="mb-6"
          variant="ghost"
          onClick={() => setSelected(null)}
        >
          Back to actions
        </Button>
        <PageHeader
          title={current.data.title}
          description="Review the action and its progress."
        />
        {problems}
        {data.recoveries.length > 0 && recoveryPanel}
        {current.data.type === "docs" && current.data.stage === "implement" && (
          <Button
            className="mb-6"
            variant="primary"
            disabled={
              data.readOnly ||
              data.lock.state !== "none" ||
              !["ready", "draft", "failed"].includes(current.data.status)
            }
            onClick={() =>
              void request({ command: "queue-action", id: current.data.id })
                .then(() => query.invalidateQueries())
                .then(() => toast.success("Action queued"))
                .catch((e) => toast.error(e.message))
            }
          >
            Queue for agent
          </Button>
        )}
        {current.data.reviewDecision?.feedback && (
          <section className="card action-detail">
            <h2>Review feedback</h2>
            <p>{current.data.reviewDecision.feedback}</p>
          </section>
        )}
        <div className="action-meta" data-review-revision={current.revision}>
          <span className="badge badge-accent">{current.data.stage}</span>
          <span className="badge">{current.data.status}</span>
          <code>{current.data.id}</code>
        </div>
        <section className="card action-detail" aria-label="Action description">
          <h2>Description</h2>
          <SafeMarkdown body={current.body} />
        </section>
        {current.data.type === "docs" && current.data.stage === "review" && (
          <section className="card action-detail" aria-label="Review decision">
            <h2>Review this result</h2>
            <p>Accept the completed work or explain what needs to change.</p>
            <div className="flex gap-3 mt-4">
              <Button
                variant="primary"
                disabled={
                  data.readOnly ||
                  data.lock.state !== "none" ||
                  busy ||
                  !current.runs.some(
                    (run) => run.data.outcome === "advanced" && run.data.commit,
                  )
                }
                onClick={() => {
                  setBusy(true);
                  void request({
                    command: "review-action",
                    id: current.data.id,
                    revision: current.revision,
                    decision: "accepted",
                    feedback: "",
                  })
                    .then(() => query.invalidateQueries())
                    .then(() => toast.success("Action accepted"))
                    .catch((e) => toast.error(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Accept
              </Button>
              <Button
                disabled={data.readOnly || data.lock.state !== "none" || busy}
                onClick={() => setReject(true)}
              >
                Reject
              </Button>
            </div>
          </section>
        )}
        <Dialog
          open={reject}
          onClose={() => {
            if (!busy) setReject(false);
          }}
          title="Send back for changes"
          description="Your agent will read this feedback before reworking the action."
          footer={
            <>
              <Button disabled={busy} onClick={() => setReject(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="reject-review"
                variant="primary"
                loading={busy}
              >
                Send back to Implement
              </Button>
            </>
          }
        >
          <form
            id="reject-review"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request({
                  command: "review-action",
                  id: current.data.id,
                  revision: current.revision,
                  decision: "rejected",
                  feedback,
                });
                await query.invalidateQueries();
                setReject(false);
                setFeedback("");
                toast.success("Sent back for changes");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Feedback">
              <textarea
                className="input"
                required
                rows={5}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
          </form>
        </Dialog>
        <section className="card action-detail" aria-label="Run results">
          <h2>Run results</h2>
          {current.runs.length ? (
            current.runs.map((run) => (
              <article key={run.path}>
                <h3>
                  {run.data.agent} · {run.data.outcome}
                </h3>
                <SafeMarkdown body={run.body} />
                {run.data.commit && (
                  <p>
                    Commit: <code>{run.data.commit}</code>
                  </p>
                )}
              </article>
            ))
          ) : (
            <p>No completed runs yet.</p>
          )}
        </section>
      </>
    );
  return (
    <>
      <PageHeader
        title="Actions"
        description="Small documentation and maintenance changes."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} aria-hidden />}
            disabled={data.readOnly || !data.hasVoidra}
            onClick={() => setCreate(true)}
          >
            Create Docs/chore action
          </Button>
        }
      />
      {!data.hasVoidra && (
        <section className="card p-6">
          <h2>Set up planning</h2>
          <p>Create a place for this project’s actions and run results.</p>
          <Button
            className="mt-4"
            onClick={() =>
              void request({ command: "create-voidra" })
                .then(() => query.invalidateQueries())
                .catch((e) => toast.error(e.message))
            }
          >
            Create .voidra/
          </Button>
        </section>
      )}
      {data.diagnostics.length > 0 && (
        <section className="service-notice" aria-label="Planning file problems">
          <h2>Planning files need attention</h2>
          <ul>
            {data.diagnostics.map((d) => (
              <li key={`${d.file}:${d.field}:${d.code}`}>
                <code>
                  {d.file}:{d.line} · {d.field}
                </code>
                <p>{d.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.hasVoidra && (
        <section className="card" aria-label="Actions list">
          {data.actions.length ? (
            <ul className="action-list">
              {data.actions.map((action) => (
                <li key={action.path}>
                  <Button
                    variant="ghost"
                    onClick={() => setSelected(action.data.id)}
                  >
                    {action.data.title}
                  </Button>
                  <span className="badge ml-3">{action.data.stage}</span>
                  <span className="text-muted ml-3">{action.data.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6">
              <h2>No actions yet</h2>
              <p>Create a small change for your coding agent to work on.</p>
            </div>
          )}
        </section>
      )}
      {data.diagnostics
        .filter((d) =>
          /^\.voidra\/actions\/(act-[0-9a-hjkmnp-tv-z]{6})\/action\.md$/.test(
            d.file,
          ),
        )
        .map((d) => (
          <Button
            key={`${d.file}:${d.code}:${d.field}`}
            className="mt-4"
            variant="ghost"
            onClick={() => setSelected(d.file.split("/")[2] ?? null)}
          >
            Inspect invalid action {d.file.split("/")[2]}
          </Button>
        ))}
      <Dialog
        open={create}
        onClose={() => {
          if (!busy) setCreate(false);
        }}
        title="Create Docs/chore action"
        description="Describe one small documentation or maintenance change."
        footer={
          <>
            <Button disabled={busy} onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-action"
              variant="primary"
              loading={busy}
            >
              Create action
            </Button>
          </>
        }
      >
        <form
          id="create-action"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request({ command: "create-action", title, description });
              await query.invalidateQueries();
              setCreate(false);
              setTitle("");
              setDescription("");
              toast.success("Action created");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Title">
            <input
              className="input"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Include the change and how to check it."
          >
            <textarea
              className="input"
              required
              rows={6}
              maxLength={20000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
        </form>
      </Dialog>
    </>
  );
}
