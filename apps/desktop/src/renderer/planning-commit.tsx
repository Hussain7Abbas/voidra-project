"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { DraftNavigation, draftField, useFormDraft } from "./form-drafts.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { Field } from "./ui/field.tsx";
import { useToast } from "./ui/toast.tsx";

export function PlanningCommit({ data }: { data: WorkspaceSnapshot }) {
  const query = useQueryClient(),
    toast = useToast(),
    prefix = useId();
  const draft = useFormDraft<{
    preview: WorkspaceSnapshot["planning"] | null;
    paths: string[];
    message: string;
    id: string;
  }>("planning-commit", "", () => ({
    preview: data.planning,
    paths: data.planning.files.map((file) => file.path),
    message: "Share planning changes",
    id: crypto.randomUUID(),
  }));
  const [preview] = draftField(draft, "preview"),
    [paths, setPaths] = draftField(draft, "paths"),
    [message, setMessage] = draftField(draft, "message"),
    [id] = draftField(draft, "id");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function close() {
    try {
      await draft.flush();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Draft could not be saved",
      );
    }
  }
  async function recover(operation: string, discard = false) {
    setBusy(true);
    try {
      await request({
        command: discard ? "discard-planning" : "recover-planning",
        id: operation,
      });
      toast.success(
        discard ? "Planning attempt discarded" : "Planning commit recovered",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      await query.invalidateQueries({ queryKey: ["workspace"] });
      setBusy(false);
    }
  }
  return (
    <>
      <section
        className="card action-detail"
        aria-label="Share planning changes"
      >
        <h2>Share planning changes</h2>
        <p>
          Commit selected planning files, then push when you are ready to share
          them.
        </p>
        {data.planning.reason && (
          <p className="text-muted">{data.planning.reason}</p>
        )}
        {data.planning.pending.map((operation) => (
          <div key={operation.id} className="recovery-row">
            <p>{operation.message}</p>
            {operation.recoverable ? (
              <div className="queue-controls">
                <Button
                  disabled={busy}
                  onClick={() => void recover(operation.id)}
                >
                  Recover planning commit
                </Button>
                {!operation.commit && (
                  <Button
                    disabled={busy}
                    onClick={() => void recover(operation.id, true)}
                  >
                    Discard interrupted attempt
                  </Button>
                )}
              </div>
            ) : (
              <p>
                The planning commit owner is still running. Wait for it to
                finish.
              </p>
            )}
          </div>
        ))}
        <Button
          disabled={
            !data.planning.enabled || data.planning.pending.length > 0 || busy
          }
          onClick={async () => {
            await draft.fresh({
              preview: data.planning,
              paths: data.planning.files.map((file) => file.path),
              message: "Share planning changes",
              id: crypto.randomUUID(),
            });
            setOpen(true);
            setError("");
          }}
        >
          Commit planning changes
        </Button>
      </section>
      <Dialog
        open={open}
        onClose={close}
        closeDisabled={busy}
        title="Commit planning changes"
        description="Choose the exact files to share and enter a commit message."
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
              variant="primary"
              loading={busy}
              disabled={!paths.length || !message.trim()}
              onClick={() => {
                if (!preview) return;
                setBusy(true);
                setError("");
                void draft
                  .flush()
                  .then(() =>
                    request({
                      command: "commit-planning",
                      id,
                      revision: preview.revision,
                      paths,
                      message,
                    }),
                  )
                  .then(async () => {
                    await draft.submitted();
                    setOpen(false);
                    toast.success("Planning changes committed");
                  })
                  .catch((e) => setError(e.message))
                  .finally(async () => {
                    await query.invalidateQueries({ queryKey: ["workspace"] });
                    setBusy(false);
                  });
              }}
            >
              Commit selected files
            </Button>
          </>
        }
      >
        <DraftNavigation form={draft} disabled={busy} />
        <p>
          Only shared files in <code>.voidra/</code> are committed. The private
          queue and recovery files stay on this machine.
        </p>
        <p className="text-muted">
          Intake may also create GLOSSARY.md and instruction pointers. Ask your
          agent to commit those separately.
        </p>
        {error && <p role="alert">{error}</p>}
        <ul>
          {preview?.files.map((file, index) => (
            <li key={file.path} className="queue-item">
              <label htmlFor={`${prefix}-${index}`}>
                <input
                  id={`${prefix}-${index}`}
                  type="checkbox"
                  disabled={busy}
                  checked={paths.includes(file.path)}
                  onChange={(event) =>
                    setPaths(
                      event.target.checked
                        ? [...paths, file.path]
                        : paths.filter((path) => path !== file.path),
                    )
                  }
                />{" "}
                <code>{file.path}</code> · {file.status}
              </label>
            </li>
          ))}
        </ul>
        <Field label="Commit message">
          <input
            className="input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={busy}
            required
          />
        </Field>
      </Dialog>
    </>
  );
}
