import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { request } from "./app.tsx";
import { flushFormDrafts } from "./form-drafts.tsx";
import { Button } from "./ui/button.tsx";
import { ConfirmDialog } from "./ui/confirm-dialog.tsx";
import { useToast } from "./ui/toast.tsx";

export function TaskDelete({
  id,
  revision,
  disabled,
  onDeleted,
}: {
  id: string;
  revision: string;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const [target, setTarget] = useState<{ id: string; revision: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    toast = useToast(),
    query = useQueryClient();
  return (
    <>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => setTarget({ id, revision })}
      >
        Delete task
      </Button>
      <ConfirmDialog
        open={target !== null}
        busy={busy}
        title="Delete this task?"
        confirmLabel="Delete task"
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          setBusy(true);
          try {
            await flushFormDrafts();
            await request({ command: "delete-task", ...target });
            await query.invalidateQueries();
            setTarget(null);
            onDeleted();
            toast.success("Task deleted · Undo can restore it");
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        This removes the card and queued work. Its questions, results and
        history stay preserved. Undo restores it.
      </ConfirmDialog>
    </>
  );
}
