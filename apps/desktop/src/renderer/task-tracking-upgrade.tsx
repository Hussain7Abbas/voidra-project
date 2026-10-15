"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { Dialog } from "./ui/dialog.tsx";
import { useToast } from "./ui/toast.tsx";

export function TaskTrackingUpgrade({ data }: { data: WorkspaceSnapshot }) {
  const [preview, setPreview] =
    useState<WorkspaceSnapshot["taskMigration"]>(null);
  const [busy, setBusy] = useState(false);
  const query = useQueryClient(),
    toast = useToast();
  if (data.taskTracking)
    return (
      <p className="text-sm text-muted mb-5">
        Release-aware task tracking enabled
      </p>
    );
  const disabled =
    busy ||
    !data.taskMigration ||
    data.readOnly ||
    data.lock.state !== "none" ||
    data.recoveries.length > 0 ||
    data.planning.pending.length > 0;
  async function enable() {
    if (!preview || disabled) return;
    setBusy(true);
    try {
      await request({
        command: "enable-task-tracking",
        revision: preview.revision,
      });
      setPreview(null);
      await query.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("Task tracking enabled");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not enable task tracking",
      );
      setPreview(null);
      await query.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section
        className="service-notice mb-5"
        aria-label="Task tracking upgrade"
      >
        <p>
          Existing records remain unchanged until you enable release-aware task
          tracking.
        </p>
        <Button
          className="mt-3"
          disabled={disabled}
          onClick={() => setPreview(data.taskMigration)}
        >
          Review task tracking upgrade
        </Button>
      </section>
      <Dialog
        open={preview !== null}
        closeDisabled={busy}
        onClose={() => {
          if (!busy) setPreview(null);
        }}
        title="Enable release-aware tasks"
        footer={
          <>
            <Button
              data-dialog-close
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={disabled}
              onClick={() => void enable()}
            >
              Enable task tracking
            </Button>
          </>
        }
      >
        <p>
          Assign release {preview?.version} to the active work listed below.
          Completed, cancelled and rejected history keeps its existing values.
          Explicitly unversioned Backlog items stay unversioned.
        </p>
        <p className="mt-3">
          The project will require Voidra 1.1.0 or newer. This upgrade can be
          undone until its records are consumed by later work.
        </p>
        <ul className="mt-4 space-y-2">
          {preview?.tasks.map((task) => (
            <li key={task.id}>
              {task.title}{" "}
              <span className="badge">
                {task.targetRelease ?? "No release"}
              </span>
            </li>
          ))}
        </ul>
        {!preview?.tasks.length && (
          <p className="mt-3">No active tasks need a release assignment.</p>
        )}
      </Dialog>
    </>
  );
}
