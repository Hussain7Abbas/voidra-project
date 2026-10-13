"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { type ActionType, actionTypeSchema } from "../shared/bridge.ts";
import { filterActionViews, groupActionViews } from "./action-filters.ts";
import { ActionQuestions, PlanGate } from "./action-gates.tsx";
import { actionLabels } from "./action-labels.ts";
import { request } from "./app.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { PlanningCommit } from "./planning-commit.tsx";
import { ProjectInbox } from "./project-inbox.tsx";
import { RunQueue } from "./run-queue.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";
export function ProjectActions({
  view,
}: {
  view: "actions" | "run" | "inbox";
}) {
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
  const whoId = useId();
  const [pendingStep, setPendingStep] = useState<{
    action: string;
    step: string;
    done: boolean;
  } | null>(null);
  const [filters, setFilters] = useState({
    type: "all",
    status: "all",
    doneBy: "all",
    assignee: "all",
  });
  const [editMode, setEditMode] = useState<
      "description" | "relationships" | null
    >(null),
    [editRevision, setEditRevision] = useState(""),
    [editBody, setEditBody] = useState(""),
    [editParent, setEditParent] = useState(""),
    [editBlocked, setEditBlocked] = useState<string[]>([]),
    [cancelOpen, setCancelOpen] = useState(false);
  const [createType, setCreateType] = useState<ActionType>("feature"),
    [doneBy, setDoneBy] = useState<"agent" | "you">("agent"),
    [steps, setSteps] = useState(""),
    [assignee, setAssignee] = useState("");
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
  const editable =
    !data.readOnly && data.lock.state === "none" && !data.recoveries.length;
  const gateEditable =
    data.lock.state === "none" && !data.recoveries.length && !data.readOnly;
  const filtered = filterActionViews(
    data.actions.map((a) => ({
      ...a,
      data: {
        ...a.data,
        ...(a.effectiveStage ? { stage: a.effectiveStage } : {}),
      },
    })),
    filters,
  );
  const stageLabels: Record<string, string> = {
    discovery: "Discovery",
    plan: "Plan",
    implement: "Implement",
    verify: "Verify",
    review: "Review",
    done: "Done",
    released: "Released",
    cancelled: "Cancelled",
    conflicted: "Conflicted",
    human: "Your tasks",
  };
  const problems = data.diagnostics.length ? (
    <section className="service-notice" aria-label="Planning file problems">
      <h2>
        {data.diagnostics.some((d) => d.code === "conflict")
          ? "Conflicted planning files"
          : "Planning files need attention"}
      </h2>
      {data.diagnostics.some((d) => d.code === "conflict") && (
        <p>
          Resolve the Git conflict markers in your editor, then save the files.
          Voidra refreshes automatically and leaves conflicted records
          untouched. You can still edit unrelated records.
        </p>
      )}
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
        closeDisabled={busy}
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
        <RunQueue
          data={data}
          editable={gateEditable && !data.planning.pending.length}
        />
        <PlanningCommit data={data} />
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
          {view === "inbox" ? "Back to inbox" : "Back to actions"}
        </Button>
        <PageHeader
          title="Action file needs attention"
          description={selected}
        />
        {problems}
      </>
    );
  const recordEditable = editable && current?.data.status !== "conflicted";
  if (current)
    return (
      <>
        <Button
          className="mb-6"
          variant="ghost"
          onClick={() => setSelected(null)}
        >
          {view === "inbox" ? "Back to inbox" : "Back to actions"}
        </Button>
        <PageHeader
          title={current.data.title}
          description="Review the action and its progress."
        />
        {problems}
        {data.recoveries.length > 0 && recoveryPanel}
        {current.data.doneBy === "agent" &&
          !["done", "released", "cancelled"].includes(
            current.data.stage ?? "",
          ) && (
            <Button
              className="mb-6"
              variant="primary"
              disabled={
                !gateEditable ||
                (!current.queueable &&
                  !(
                    current.data.type === "profile-change" &&
                    current.data.status === "draft" &&
                    !current.blocked
                  ))
              }
              loading={busy}
              onClick={() => {
                setBusy(true);
                void request({
                  command: "queue-action",
                  id: current.data.id,
                  revision: current.editRevision,
                })
                  .then(() => query.invalidateQueries())
                  .then(() => toast.success("Action queued"))
                  .catch((e) => toast.error(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {current.data.type === "profile-change" &&
              current.data.status === "draft"
                ? "Activate and queue draft"
                : "Queue for agent"}
            </Button>
          )}
        <section className="card action-detail" aria-label="Linked commits">
          <h2>Linked commits</h2>
          {data.history.notice && <p>{data.history.notice}</p>}
          {data.history.commits.some((c) =>
            c.actions.includes(current.data.id),
          ) ? (
            <ul>
              {data.history.commits
                .filter((c) => c.actions.includes(current.data.id))
                .map((commit) => (
                  <li key={commit.hash} className="queue-item">
                    <div>
                      <strong>{commit.subject}</strong>
                      <p className="text-muted">
                        {commit.author} · {commit.at}
                      </p>
                      <code>{commit.hash.slice(0, 12)}</code>
                    </div>
                    {commit.url && (
                      <Button
                        onClick={() =>
                          void request({
                            command: "open-commit",
                            hash: commit.hash,
                          }).catch((e) => toast.error(e.message))
                        }
                      >
                        Open {commit.hash.slice(0, 7)} on GitHub
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          ) : (
            <p>No commits with this action’s trailer yet.</p>
          )}
        </section>
        {current.data.reviewDecision?.feedback && (
          <section className="card action-detail">
            <h2>Review feedback</h2>
            <p>{current.data.reviewDecision.feedback}</p>
          </section>
        )}
        <div className="action-meta" data-review-revision={current.revision}>
          <span className="badge badge-accent">
            {stageLabels[current.effectiveStage ?? "human"] ??
              current.effectiveStage}
          </span>
          <span className="badge">{current.data.status}</span>
          <code>{current.data.id}</code>
        </div>
        <section className="card action-detail" aria-label="Action description">
          <div className="flex justify-between gap-4">
            <h2>Description</h2>
            <Button
              variant="ghost"
              disabled={!recordEditable}
              onClick={() => {
                setEditBody(current.body);
                setEditRevision(current.editRevision);
                setError("");
                setEditMode("description");
              }}
            >
              Edit description
            </Button>
          </div>
          <SafeMarkdown body={current.body} />
        </section>
        {!!current.timeline.length && (
          <section className="card action-detail">
            <h2>Stage timeline</h2>
            <ol className="flex flex-wrap gap-3">
              {current.timeline.map((stage) => (
                <li
                  key={stage}
                  aria-current={
                    stage === current.effectiveStage ? "step" : undefined
                  }
                >
                  <span
                    className={
                      stage === current.effectiveStage
                        ? "badge badge-accent"
                        : "badge"
                    }
                  >
                    {stageLabels[stage] ?? stage}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {current.data.doneBy === "you" && (
          <section className="card action-detail">
            <h2>Your steps</h2>
            <ul className="space-y-3">
              {current.data.steps?.map((step) => (
                <li key={step.id}>
                  <label
                    className="flex items-center gap-3"
                    htmlFor={`step-${current.data.id}-${step.id}`}
                  >
                    <input
                      id={`step-${current.data.id}-${step.id}`}
                      type="checkbox"
                      checked={
                        pendingStep?.action === current.data.id &&
                        pendingStep.step === step.id
                          ? pendingStep.done
                          : step.done
                      }
                      disabled={
                        !recordEditable ||
                        busy ||
                        ["cancelled", "released"].includes(
                          current.data.stage ?? "",
                        )
                      }
                      onChange={(e) => {
                        setBusy(true);
                        setPendingStep({
                          action: current.data.id,
                          step: step.id,
                          done: e.target.checked,
                        });
                        void request({
                          command: "set-human-step",
                          id: current.data.id,
                          revision: current.editRevision,
                          step: step.id,
                          done: e.target.checked,
                        })
                          .then(() => query.invalidateQueries())
                          .catch((e) => toast.error(e.message))
                          .finally(() => {
                            setBusy(false);
                            setPendingStep(null);
                          });
                      }}
                    />
                    {step.title}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card action-detail">
          <div className="flex justify-between gap-4">
            <h2>Dependencies and slices</h2>
            <Button
              variant="ghost"
              disabled={!recordEditable}
              onClick={() => {
                setEditParent(current.data.parent ?? "");
                setEditBlocked(current.data.blockedBy ?? []);
                setEditRevision(current.editRevision);
                setError("");
                setEditMode("relationships");
              }}
            >
              Edit dependencies
            </Button>
          </div>
          {current.data.assignee && <p>Assigned to {current.data.assignee}</p>}
          {current.data.parent && (
            <p>
              Parent:{" "}
              <Button
                variant="ghost"
                onClick={() => setSelected(current.data.parent ?? null)}
              >
                {data.actions.find((a) => a.data.id === current.data.parent)
                  ?.data.title ?? current.data.parent}
              </Button>
            </p>
          )}
          {current.blocked && (
            <p className="text-muted">
              Blocked until dependencies and child slices are complete.
            </p>
          )}
          <h3 className="font-semibold mt-4">Blocked by</h3>
          {current.data.blockedBy?.length ? (
            <ul>
              {current.data.blockedBy.map((id) => (
                <li key={id}>
                  <Button variant="ghost" onClick={() => setSelected(id)}>
                    {data.actions.find((a) => a.data.id === id)?.data.title ??
                      id}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No blockers.</p>
          )}
          <h3 className="font-semibold mt-4">Child slices</h3>
          <ul>
            {data.actions
              .filter((a) => a.data.parent === current.data.id)
              .map((child) => (
                <li key={child.data.id}>
                  <Button
                    variant="ghost"
                    onClick={() => setSelected(child.data.id)}
                  >
                    {child.data.title}
                  </Button>
                  <span className="badge ml-3">
                    {stageLabels[child.data.stage ?? "human"] ??
                      child.data.stage}{" "}
                    · {child.data.status}
                  </span>
                </li>
              ))}
          </ul>
          {current.data.completedBySlices && (
            <p className="text-muted mt-3">Completed from its child slices.</p>
          )}
          {current.data.links?.length && (
            <>
              <h3 className="font-semibold mt-4">Links</h3>
              <ul>
                {current.data.links.map((link) => (
                  <li key={link}>
                    <code>{link}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <ActionQuestions action={current} disabled={!gateEditable} />
        <PlanGate action={current} disabled={!gateEditable} />
        {current.data.planFeedback && (
          <section className="card action-detail">
            <h2>Plan feedback</h2>
            <p>{current.data.planFeedback.feedback}</p>
          </section>
        )}
        {current.plans.length > 0 && (
          <section className="card action-detail">
            <h2>Plan files</h2>
            {current.plans.map((plan) => (
              <article key={plan.path}>
                <h3 className="font-semibold mt-4">{plan.name}</h3>
                <SafeMarkdown body={plan.body} />
              </article>
            ))}
          </section>
        )}
        {!["done", "released", "cancelled"].includes(
          current.data.stage ?? "",
        ) &&
          current.data.status !== "complete" && (
            <Button
              variant="ghost"
              disabled={!recordEditable}
              onClick={() => setCancelOpen(true)}
            >
              Cancel action
            </Button>
          )}
        <Dialog
          closeDisabled={busy}
          open={cancelOpen}
          title="Cancel this action?"
          description="The action keeps its history and will be removed from your run queue."
          onClose={() => {
            if (!busy) setCancelOpen(false);
          }}
          footer={
            <>
              <Button disabled={busy} onClick={() => setCancelOpen(false)}>
                Keep action
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  void request({
                    command: "edit-action",
                    id: current.data.id,
                    revision: current.editRevision,
                    cancel: true,
                  })
                    .then(() => query.invalidateQueries())
                    .then(() => setCancelOpen(false))
                    .catch((e) => toast.error(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Confirm cancellation
              </Button>
            </>
          }
        />
        <Dialog
          closeDisabled={busy}
          open={editMode !== null}
          title={
            editMode === "description"
              ? "Edit description"
              : "Edit dependencies"
          }
          onClose={() => {
            if (!busy) setEditMode(null);
          }}
          footer={
            <>
              <Button disabled={busy} onClick={() => setEditMode(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="action-editor"
                variant="primary"
                loading={busy}
              >
                Save changes
              </Button>
            </>
          }
        >
          <form
            id="action-editor"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void request(
                editMode === "description"
                  ? {
                      command: "edit-action",
                      id: current.data.id,
                      revision: editRevision,
                      description: editBody,
                    }
                  : {
                      command: "edit-action",
                      id: current.data.id,
                      revision: editRevision,
                      parent: editParent || null,
                      blockedBy: editBlocked,
                    },
              )
                .then(() => query.invalidateQueries())
                .then(() => setEditMode(null))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {editMode === "description" ? (
              <>
                <Field label="Description">
                  <textarea
                    className="input"
                    required
                    rows={7}
                    maxLength={20000}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                </Field>
                <div className="idea-preview">
                  <SafeMarkdown body={editBody} />
                </div>
              </>
            ) : (
              <>
                <Field label="Parent action">
                  <select
                    className="input"
                    value={editParent}
                    onChange={(e) => setEditParent(e.target.value)}
                  >
                    <option value="">No parent</option>
                    {data.actions
                      .filter((a) => a.data.id !== current.data.id)
                      .map((a) => (
                        <option value={a.data.id} key={a.data.id}>
                          {a.data.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <fieldset>
                  <legend className="field-label">Blocked by</legend>
                  <ul className="space-y-2">
                    {data.actions
                      .filter((a) => a.data.id !== current.data.id)
                      .map((a) => (
                        <li key={a.data.id}>
                          <label htmlFor={`block-${a.data.id}`}>
                            <input
                              id={`block-${a.data.id}`}
                              type="checkbox"
                              checked={editBlocked.includes(a.data.id)}
                              onChange={(e) =>
                                setEditBlocked((ids) =>
                                  e.target.checked
                                    ? [...ids, a.data.id]
                                    : ids.filter((id) => id !== a.data.id),
                                )
                              }
                            />{" "}
                            {a.data.title}
                          </label>
                        </li>
                      ))}
                  </ul>
                </fieldset>
              </>
            )}
            {error && (
              <p role="alert" className="text-danger">
                {error}
              </p>
            )}
            {current.editRevision !== editRevision && (
              <div className="service-notice">
                <p>This action changed on disk. Reload before saving.</p>
                <Button
                  onClick={() => {
                    setEditRevision(current.editRevision);
                    setEditBody(current.body);
                    setEditParent(current.data.parent ?? "");
                    setEditBlocked(current.data.blockedBy ?? []);
                    setError("");
                  }}
                >
                  Reload action
                </Button>
                {editMode === "description" && (
                  <Button
                    onClick={() => {
                      setBusy(true);
                      void request({
                        command: "edit-action",
                        id: current.data.id,
                        revision: current.editRevision,
                        description: editBody,
                      })
                        .then(() => query.invalidateQueries())
                        .then(() => setEditMode(null))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Overwrite current description
                  </Button>
                )}
              </div>
            )}
          </form>
        </Dialog>
        {current.effectiveStage === "review" &&
          (current.data.status === "waiting" ||
            data.diagnostics.some(
              (d) => d.file === current.path && d.code === "stale-review",
            )) && (
            <section
              className="card action-detail"
              aria-label="Review decision"
            >
              <h2>Review this result</h2>
              <p>
                {current.data.type === "release"
                  ? "Acceptance authorizes the next agent run to commit the version bump and create the tag."
                  : "Accept the completed work or explain what needs to change."}
              </p>
              <div className="flex gap-3 mt-4">
                <Button
                  variant="primary"
                  disabled={
                    !gateEditable ||
                    busy ||
                    !current.runs.some(
                      (run) =>
                        ["advanced", "waiting"].includes(run.data.outcome) &&
                        run.data.endedAt &&
                        (["research", "release"].includes(current.data.type) ||
                          run.data.commit),
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
                  disabled={!gateEditable || busy}
                  onClick={() => {
                    setReject(true);
                    setEditRevision(current.revision);
                  }}
                >
                  Reject
                </Button>
              </div>
            </section>
          )}
        <Dialog
          closeDisabled={busy}
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
                Send back to{" "}
                {current.data.type === "research"
                  ? "Discovery"
                  : current.data.type === "release"
                    ? "Plan"
                    : "Implement"}
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
                  revision: editRevision,
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
                {run.data.checks?.length ? (
                  <ul aria-label="Checks run">
                    {run.data.checks.map((check) => (
                      <li key={check.name}>
                        {check.passed ? "Passed" : "Failed"}: {check.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">No checks recorded.</p>
                )}
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
  if (view === "inbox")
    return <ProjectInbox workspace={data} onSelect={setSelected} />;
  return (
    <>
      <PageHeader
        title="Actions"
        description="Your project’s planned work and progress."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} aria-hidden />}
            disabled={!editable || !data.hasVoidra}
            onClick={() => {
              setAssignee(data.identity.value ?? "");
              setCreate(true);
            }}
          >
            New action
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
          <h2>
            {data.diagnostics.some((d) => d.code === "conflict")
              ? "Conflicted planning files"
              : "Planning files need attention"}
          </h2>
          {data.diagnostics.some((d) => d.code === "conflict") && (
            <p>
              Resolve the Git conflict markers in your editor, then save the
              files. Voidra refreshes automatically and leaves conflicted
              records untouched.{" "}
              {data.readOnly
                ? "Resolve the project settings or other structural problems before editing."
                : "You can still edit unrelated records."}
            </p>
          )}
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
        <>
          <form
            className="board-filters mb-6"
            aria-label="Action filters"
            onSubmit={(e) => e.preventDefault()}
          >
            <Field label="Type">
              <select
                className="input"
                value={filters.type}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, type: e.target.value }))
                }
              >
                <option value="all">All types</option>
                {actionTypeSchema.options.map((t) => (
                  <option key={t} value={t}>
                    {actionLabels[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="all">All statuses</option>
                {[
                  "draft",
                  "ready",
                  "running",
                  "waiting",
                  "failed",
                  "conflicted",
                  "complete",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Done by">
              <select
                className="input"
                value={filters.doneBy}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, doneBy: e.target.value }))
                }
              >
                <option value="all">Anyone</option>
                <option value="agent">Agent</option>
                <option value="you">You</option>
              </select>
            </Field>
            <Field label="Assignee">
              <select
                className="input"
                value={filters.assignee}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, assignee: e.target.value }))
                }
              >
                <option value="all">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {[
                  ...new Set(
                    data.actions.flatMap((a) =>
                      a.data.assignee ? [a.data.assignee] : [],
                    ),
                  ),
                ]
                  .sort()
                  .map((name) => (
                    <option value={name} key={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </Field>
          </form>
          {data.identity.notice && (
            <p className="text-muted mb-4">{data.identity.notice}</p>
          )}
          <p role="status" className="text-muted mb-4">
            {filtered.length} matching{" "}
            {filtered.length === 1 ? "action" : "actions"}
          </p>
          <section className="actions-board" aria-label="Actions board">
            {Object.entries(stageLabels).map(([stage, label]) => {
              const visible = filtered.filter(
                (a) =>
                  (a.data.doneBy === "you" && !a.data.stage
                    ? "human"
                    : a.data.stage) === stage,
              );
              if (!visible.length) return null;
              return (
                <section className="board-column" key={stage}>
                  <h2 className="font-semibold mb-3">
                    {label} <span className="text-muted">{visible.length}</span>
                  </h2>
                  <ul className="space-y-3">
                    {groupActionViews(data.actions, visible).map((group) => (
                      <li
                        key={group.parent?.data.id ?? group.actions[0]?.data.id}
                      >
                        {group.actions.some((a) => a.data.parent) &&
                          group.parent && (
                            <div className="slice-group-header">
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  setSelected(group.parent?.data.id ?? null)
                                }
                              >
                                Slices of {group.parent.data.title}
                              </Button>
                            </div>
                          )}
                        <ul className="space-y-3">
                          {group.actions.map((action) => (
                            <li className="card p-4" key={action.data.id}>
                              <Button
                                variant="ghost"
                                onClick={() => setSelected(action.data.id)}
                              >
                                {action.data.title}
                              </Button>
                              <div className="flex gap-2 flex-wrap mt-2">
                                <span className="badge">
                                  {actionLabels[
                                    action.data.type as ActionType
                                  ] ?? action.data.type}
                                </span>
                                <span className="text-muted">
                                  {action.data.status}
                                </span>
                                {action.blocked && (
                                  <span className="badge">Blocked</span>
                                )}
                              </div>
                              {action.data.assignee && (
                                <p className="text-muted mt-2">
                                  {action.data.assignee}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </section>
          {!filtered.length && (
            <section className="card p-6">
              <h2>No actions in this view</h2>
              <p>Create work or adjust the filters.</p>
            </section>
          )}
        </>
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
        closeDisabled={busy}
        open={create}
        onClose={() => {
          if (!busy) setCreate(false);
        }}
        title="Create action"
        description="Describe one outcome and choose who will do the work."
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
              await request({
                command: "create-action",
                title,
                description,
                type: createType,
                doneBy,
                assignee: assignee.trim() || undefined,
                steps:
                  doneBy === "you"
                    ? steps
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : undefined,
              });
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
          <Field label="Action type">
            <select
              className="input"
              name="type"
              value={createType}
              onChange={(e) => setCreateType(e.target.value as ActionType)}
            >
              {actionTypeSchema.options.map((t) => (
                <option key={t} value={t}>
                  {actionLabels[t]}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="field-label">Who does the work?</legend>
            <div className="flex gap-4">
              {(["agent", "you"] as const).map((who) => (
                <label htmlFor={`${whoId}-${who}`} key={who}>
                  <input
                    id={`${whoId}-${who}`}
                    type="radio"
                    name="done-by"
                    checked={doneBy === who}
                    onChange={() => setDoneBy(who)}
                  />{" "}
                  {who === "agent" ? "Agent" : "You"}
                </label>
              ))}
            </div>
          </fieldset>
          {doneBy === "you" && (
            <Field
              label="Steps"
              hint="One step per line. You will tick these off in the action."
            >
              <textarea
                className="input"
                name="steps"
                required
                rows={4}
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
            </Field>
          )}
          <Field
            label="Assignee"
            hint="Optional. Leave unassigned if anyone can take it."
          >
            <input
              className="input"
              name="assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </Field>
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
