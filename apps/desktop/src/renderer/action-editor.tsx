"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { DraftNavigation, useFormDraft } from "./form-drafts.tsx";
import { MarkdownEditor } from "./markdown-editor.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { useToast } from "./ui/toast.tsx";

type Action = WorkspaceSnapshot["actions"][number];
export function ActionEditor({
  action,
  actions,
  mode,
  initialBody,
  disabled,
  onClose,
}: {
  action: Action;
  actions: Action[];
  mode: "description" | "relationships";
  initialBody: string;
  disabled: boolean;
  onClose: () => void;
}) {
  const query = useQueryClient(),
    toast = useToast(),
    id = useId();
  const initial = () => ({
    revision: action.editRevision,
    body: initialBody,
    parent: action.data.parent ?? "",
    blocked: action.data.blockedBy ?? [],
  });
  const draft = useFormDraft("task-edit", `${action.data.id}:${mode}`, initial);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const value = draft.values;
  async function close() {
    try {
      await draft.flush();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved",
      );
    }
  }
  async function save(overwrite = false) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await draft.flush();
      await request(
        mode === "description"
          ? {
              command: "edit-action",
              id: action.data.id,
              revision: overwrite ? action.editRevision : value.revision,
              description: value.body,
            }
          : {
              command: "edit-action",
              id: action.data.id,
              revision: value.revision,
              parent: value.parent || null,
              blockedBy: value.blocked,
            },
      );
      await draft.submitted();
      await query.invalidateQueries();
      toast.success("Action saved");
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Action could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      closeDisabled={busy}
      onClose={close}
      title={mode === "description" ? "Edit description" : "Edit dependencies"}
      footer={
        <>
          <Button
            data-dialog-close
            disabled={busy}
            onClick={() => void close()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={id}
            variant="primary"
            loading={busy}
            disabled={disabled}
          >
            Save changes
          </Button>
        </>
      }
    >
      <DraftNavigation form={draft} disabled={busy} />
      <form
        id={id}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {mode === "description" ? (
          <Field label="Description">
            <MarkdownEditor
              documentKey={draft.id}
              required
              disabled={busy}
              rows={7}
              maxLength={20000}
              value={value.body}
              onChange={(body) =>
                draft.set((previous) => ({ ...previous, body }))
              }
            />
          </Field>
        ) : (
          <>
            <Field label="Parent action">
              <select
                className="input"
                disabled={busy}
                value={value.parent}
                onChange={(event) =>
                  draft.set((previous) => ({
                    ...previous,
                    parent: event.target.value,
                  }))
                }
              >
                <option value="">No parent</option>
                {value.parent &&
                  !actions.some(
                    (candidate) => candidate.data.id === value.parent,
                  ) && (
                    <option value={value.parent}>
                      {value.parent} (unavailable)
                    </option>
                  )}
                {actions
                  .filter((candidate) => candidate.data.id !== action.data.id)
                  .map((candidate) => (
                    <option key={candidate.data.id} value={candidate.data.id}>
                      {candidate.data.title}
                    </option>
                  ))}
              </select>
            </Field>
            <fieldset disabled={busy}>
              <legend className="field-label">Blocked by</legend>
              <ul className="space-y-2">
                {actions
                  .filter((candidate) => candidate.data.id !== action.data.id)
                  .map((candidate) => (
                    <li key={candidate.data.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={value.blocked.includes(candidate.data.id)}
                          onChange={(event) =>
                            draft.set((previous) => ({
                              ...previous,
                              blocked: event.target.checked
                                ? [...previous.blocked, candidate.data.id]
                                : previous.blocked.filter(
                                    (id) => id !== candidate.data.id,
                                  ),
                            }))
                          }
                        />{" "}
                        {candidate.data.title}
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
        {action.editRevision !== value.revision && (
          <div className="service-notice">
            <p>This action changed on disk. Reload before saving.</p>
            <Button
              disabled={busy}
              onClick={() =>
                void draft
                  .fresh({ ...initial(), body: action.body })
                  .catch((cause) => setError(String(cause)))
              }
            >
              Reload action
            </Button>
            {mode === "description" && (
              <Button
                disabled={busy || disabled}
                onClick={() => void save(true)}
              >
                Overwrite current description
              </Button>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
export function ReviewRejection({
  action,
  disabled,
  onClose,
}: {
  action: Action;
  disabled: boolean;
  onClose: () => void;
}) {
  const query = useQueryClient(),
    toast = useToast(),
    id = useId();
  const draft = useFormDraft("review-feedback", action.data.id, () => ({
    feedback: "",
    revision: action.revision,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function close() {
    try {
      await draft.flush();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved",
      );
    }
  }
  return (
    <Dialog
      open
      closeDisabled={busy}
      onClose={close}
      title="Send back for changes"
      description="Your agent will read this feedback before reworking the action."
      footer={
        <>
          <Button
            data-dialog-close
            disabled={busy}
            onClick={() => void close()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={id}
            variant="primary"
            loading={busy}
            disabled={disabled}
          >
            Send back to{" "}
            {action.data.type === "research"
              ? "Discovery"
              : action.data.type === "release"
                ? "Plan"
                : "Implement"}
          </Button>
        </>
      }
    >
      <DraftNavigation form={draft} disabled={busy} />
      <form
        id={id}
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || busy) return;
          setBusy(true);
          setError("");
          try {
            await draft.flush();
            await request({
              command: "review-action",
              id: action.data.id,
              revision: draft.values.revision,
              decision: "rejected",
              feedback: draft.values.feedback,
            });
            await draft.submitted();
            await query.invalidateQueries();
            toast.success("Sent back for changes");
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Review could not be saved",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Feedback">
          <MarkdownEditor
            documentKey={draft.id}
            required
            disabled={busy}
            rows={5}
            maxLength={20000}
            value={draft.values.feedback}
            onChange={(feedback) =>
              draft.set((previous) => ({ ...previous, feedback }))
            }
          />
        </Field>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {action.revision !== draft.values.revision && (
          <p role="status">
            This review changed. Your original feedback is preserved; reopen the
            current review before submitting.
          </p>
        )}
      </form>
    </Dialog>
  );
}
