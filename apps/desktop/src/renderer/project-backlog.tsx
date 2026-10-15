"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ActionType,
  actionTypeSchema,
  type WorkspaceSnapshot,
} from "../shared/bridge.ts";
import { actionLabels } from "./action-labels.ts";
import { AiSuggestionButton } from "./ai-suggestion.tsx";
import { request } from "./app.tsx";
import { DraftNavigation, draftField, useFormDraft } from "./form-drafts.tsx";
import { SafeMarkdown } from "./markdown.tsx";
import { MarkdownEditor } from "./markdown-editor.tsx";
import { TaskCapture } from "./task-capture.tsx";
import { AssigneeSelect } from "./team-settings.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

type Idea = WorkspaceSnapshot["ideas"][number];
const statuses = [
  "new",
  "needs-info",
  "ready",
  "promoted",
  "rejected",
] as const;
type Status = (typeof statuses)[number];
const labels: Record<Status, string> = {
  new: "New",
  "needs-info": "Needs info",
  ready: "Ready",
  promoted: "Promoted",
  rejected: "Rejected",
};

export function ProjectBacklog({
  selectedId,
  onBack,
}: {
  selectedId?: string;
  onBack?: () => void;
} = {}) {
  const query = useQueryClient(),
    toast = useToast();
  const workspace = useQuery({
    queryKey: ["workspace"],
    refetchOnMount: false,
    queryFn: async () => {
      const result = await request({ command: "workspace" });
      if (result.kind !== "workspace")
        throw new Error("Unexpected project response");
      return result.workspace;
    },
  });
  const [capture, setCapture] = useState(false);
  const draft = useFormDraft<{
    promoting: boolean;
    actionType: ActionType;
    editing: { id: string; revision: string; originalStatus: Status } | null;
    title: string;
    description: string;
    status: Status;
    reason: string;
    targetRelease: string;
    assignee: string;
  }>("idea-edit", "", () => ({
    promoting: false,
    actionType: "feature",
    editing: null,
    title: "",
    description: "",
    status: "new",
    reason: "",
    targetRelease: "",
    assignee: "",
  }));
  const [promoting] = draftField(draft, "promoting"),
    [actionType, setActionType] = draftField(draft, "actionType"),
    [editing] = draftField(draft, "editing"),
    [title, setTitle] = draftField(draft, "title"),
    [description, setDescription] = draftField(draft, "description"),
    [status, setStatus] = draftField(draft, "status"),
    [reason, setReason] = draftField(draft, "reason"),
    [targetRelease, setTargetRelease] = draftField(draft, "targetRelease"),
    [assignee, setAssignee] = draftField(draft, "assignee");
  const [filter, setFilter] = useState("all"),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  if (workspace.isPending) return <Spinner label="Loading ideas" />;
  if (workspace.isError)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  const data = workspace.data,
    editable =
      !data.readOnly && data.lock.state === "none" && !data.recoveries.length;
  const close = async () => {
    try {
      await draft.flush();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved",
      );
    }
  };
  const start = async (idea: Idea | null, promote = false) => {
    await draft.fresh({
      promoting: promote,
      actionType: idea?.data.type ?? "feature",
      editing: idea
        ? {
            id: idea.data.id,
            revision: idea.revision,
            originalStatus: idea.data.status as Status,
          }
        : null,
      title: idea?.data.title ?? "",
      description: idea?.body ?? "",
      status: (idea?.data.status as Status) ?? "new",
      reason: idea?.data.reason ?? "",
      targetRelease: idea
        ? (idea.data.targetRelease ?? "")
        : (data.projectRelease.version ?? ""),
      assignee: idea?.data.assignee ?? "",
    });
    setError("");
    setOpen(true);
  };
  const save = async (revision = editing?.revision) => {
    if (!editing) {
      setError("Open an existing idea to edit or promote it.");
      return;
    }
    if (!title.trim()) {
      setError("Generate and review a title, or enter one, before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await draft.flush();
      if (promoting && editing && revision) {
        await request({
          command: "promote-idea",
          assignee: assignee || null,
          id: editing.id,
          revision,
          type: actionType,
          title,
          description,
        });
        setFilter("all");
      } else if (editing && revision)
        await request({
          command: "edit-idea",
          assignee: assignee || null,
          targetRelease: data.taskTracking ? targetRelease || null : undefined,
          id: editing.id,
          revision,
          title,
          description,
          status,
          reason: status === "rejected" ? reason : undefined,
        });
      else {
        if (status === "promoted")
          throw new Error("Promote an existing idea through its action.");
        await request({
          command: "create-idea",
          targetRelease: data.taskTracking ? targetRelease || null : undefined,
          title,
          description,
          status,
          reason: status === "rejected" ? reason : undefined,
        });
      }
      await draft.submitted();
      await query.invalidateQueries();
      setOpen(false);
      toast.success(promoting ? "Idea promoted to an action" : "Idea saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const ideas = data.ideas.filter((i) =>
    selectedId
      ? i.data.id === selectedId
      : filter === "all" || i.data.status === filter,
  );
  const current = editing
    ? data.ideas.find((i) => i.data.id === editing.id)
    : undefined;
  const changed = editing && current && current.revision !== editing.revision;
  return (
    <>
      {onBack && (
        <Button className="mb-5" onClick={onBack}>
          Back to Tasks
        </Button>
      )}
      <PageHeader
        title={selectedId ? "Backlog task" : "Backlog"}
        description="Collect ideas and keep their decisions beside the project."
        actions={
          !selectedId ? (
            <Button
              variant="primary"
              icon={<Plus size={16} aria-hidden />}
              disabled={!editable}
              onClick={() => setCapture(true)}
            >
              New idea
            </Button>
          ) : undefined
        }
      />
      {!!data.diagnostics.length && (
        <section className="service-notice">
          <h2>Planning files need attention</h2>
          <ul>
            {data.diagnostics.map((d) => (
              <li key={`${d.file}:${d.field}:${d.code}`}>
                <code>
                  {d.file}:{d.line}
                </code>
                <p>{d.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mb-6 max-w-xs" hidden={!!selectedId}>
        <Field label="Idea status">
          <select
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All ideas</option>
            {statuses.map((s) => (
              <option value={s} key={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-muted mb-4" role="status">
        {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}
      </p>
      <ul className="space-y-4" aria-label="Ideas">
        {ideas.map((idea) => (
          <li key={idea.data.id}>
            <article className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{idea.data.title}</h2>
                  <span className="badge mt-2">
                    {labels[idea.data.status as Status] ?? idea.data.status}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Edit idea: ${idea.data.title}`}
                  disabled={!editable}
                  onClick={() => start(idea)}
                >
                  Edit
                </Button>
                {["new", "needs-info", "ready"].includes(idea.data.status) && (
                  <Button
                    aria-label={`Promote idea: ${idea.data.title}`}
                    disabled={!editable}
                    onClick={() => start(idea, true)}
                  >
                    Promote
                  </Button>
                )}
              </div>
              <div className="mt-4">
                <SafeMarkdown body={idea.body} />
              </div>
              {idea.data.reason && (
                <div className="mt-4">
                  <h3 className="font-semibold">Reason for rejection</h3>
                  <SafeMarkdown body={idea.data.reason} />
                </div>
              )}
              {idea.data.promotedTo && (
                <p className="text-muted mt-4">
                  Action: <code>{idea.data.promotedTo}</code>
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>
      {!ideas.length && (
        <section className="card p-6">
          <h2>No ideas in this view</h2>
          <p>Capture a possibility, then refine its scope.</p>
        </section>
      )}
      {capture && (
        <TaskCapture
          kind="idea"
          data={data}
          onClose={() => setCapture(false)}
        />
      )}
      <Dialog
        closeDisabled={busy}
        open={open}
        title={promoting ? "Promote idea" : editing ? "Edit idea" : "New idea"}
        description="Describe the possibility and its current status."
        onClose={close}
        footer={
          <>
            <Button
              data-dialog-close
              disabled={busy}
              onClick={() => void close()}
            >
              Cancel
            </Button>
            {!title.trim() ? (
              <AiSuggestionButton
                key={`${draft.id}:title`}
                owner={draft.id}
                showUnavailable
                label="Generate title"
                disabled={busy}
                intent={{
                  feature: "task-title",
                  notes: description,
                  target: promoting ? "action" : "idea",
                }}
                onApply={(suggestion) => {
                  if (suggestion.feature === "task-title")
                    setTitle(suggestion.title);
                }}
              />
            ) : (
              <Button
                type="submit"
                form="idea-editor"
                variant="primary"
                loading={busy}
              >
                {promoting ? "Create action" : "Save idea"}
              </Button>
            )}
          </>
        }
      >
        <DraftNavigation form={draft} disabled={busy} />
        <form
          inert={busy}
          id="idea-editor"
          className="space-y-4"
          onInvalidCapture={(e) => {
            const control = e.target as HTMLInputElement;
            control.setAttribute("aria-invalid", "true");
          }}
          onInputCapture={(e) => {
            const control = e.target as HTMLInputElement;
            if (control.validity?.valid)
              control.removeAttribute("aria-invalid");
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <AiSuggestionButton
            key={draft.id}
            owner={draft.id}
            label="Improve with AI"
            intent={{
              feature: "rewrite",
              notes: [title, description].filter(Boolean).join("\n"),
              target: promoting ? "action" : "idea",
            }}
            disabled={busy}
            onApply={(suggestion) => {
              if (suggestion.feature === "rewrite") {
                setTitle(suggestion.title);
                setDescription(suggestion.description);
              }
            }}
          />
          <Field label="Title">
            <input
              className="input"
              name="title"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Assignee">
            <AssigneeSelect
              value={assignee}
              onChange={setAssignee}
              disabled={busy}
            />
          </Field>
          {data.taskTracking && !promoting && (
            <Field
              label="Target release"
              hint="Backlog may have no release. An existing assignment is preserved when promoted."
            >
              <select
                className="input"
                value={targetRelease}
                onChange={(event) => setTargetRelease(event.target.value)}
              >
                <option value="">No release</option>
                {[
                  ...new Set(
                    [
                      data.projectRelease.version,
                      targetRelease,
                      ...data.releases.map((release) => release.data.version),
                    ].filter((value): value is string => !!value),
                  ),
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                    {value === data.projectRelease.version ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label="Description"
            hint="Write Markdown; formatting stays visible around the line you edit."
          >
            <MarkdownEditor
              documentKey={`idea:${editing?.id ?? "new"}:${promoting ? "promote" : "edit"}`}
              disabled={busy}
              required
              rows={6}
              maxLength={20000}
              value={description}
              onChange={setDescription}
            />
          </Field>
          {promoting && (
            <Field label="Action type">
              <select
                className="input"
                name="type"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
              >
                {actionTypeSchema.options.map((t) => (
                  <option key={t} value={t}>
                    {actionLabels[t]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!promoting && (
            <Field label="Status">
              <select
                className="input"
                name="status"
                value={status}
                disabled={editing?.originalStatus === "promoted"}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                {statuses
                  .filter(
                    (s) =>
                      s !== "promoted" ||
                      editing?.originalStatus === "promoted",
                  )
                  .map((s) => (
                    <option value={s} key={s}>
                      {labels[s]}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {!promoting && status === "rejected" && (
            <Field label="Rejection reason">
              <MarkdownEditor
                documentKey={`${draft.id}:reason`}
                required
                rows={3}
                maxLength={20000}
                value={reason}
                onChange={setReason}
              />
            </Field>
          )}
          {error && (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="text-danger"
            >
              {error}
            </p>
          )}
          {changed && (
            <div className="service-notice">
              <p>
                This idea changed on disk. Reload it or explicitly replace its
                current description and status.
              </p>
              <div className="flex gap-3 mt-3">
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (current) start(current);
                  }}
                >
                  Reload idea
                </Button>
                <Button
                  disabled={busy || !editable}
                  onClick={() => {
                    if (current) void save(current.revision);
                  }}
                >
                  {promoting
                    ? "Promote current revision"
                    : "Overwrite current idea"}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Dialog>
    </>
  );
}
