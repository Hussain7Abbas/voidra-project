/* Adapted from storylens dashboard; copyright 2026 Hussain Abbas. AGPL-3.0-or-later. */
import type { ReactNode } from "react";
import { Button } from "./button.tsx";
import { Dialog } from "./dialog.tsx";

/** Asks before a destructive or irreversible action. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "danger",
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** `primary` for confirmations that are not destructive (approving a request). */
  tone?: "danger" | "primary";
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button data-dialog-close onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{children}</div>
      {error && (
        <p className="field-error mt-4" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
