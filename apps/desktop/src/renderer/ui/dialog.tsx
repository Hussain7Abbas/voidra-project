/* Adapted from storylens dashboard; copyright 2026 Hussain Abbas. AGPL-3.0-or-later. */
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./button.tsx";

/**
 * Native modal dialog: focus moves in, Escape or the close button closes it,
 * and focus returns to the control that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const opener = document.activeElement as HTMLElement | null;
      dialog.showModal();
      return () => {
        if (dialog.open) dialog.close();
        opener?.focus();
      };
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];

  return (
    <dialog
      ref={ref}
      closedby={closeDisabled ? "none" : "any"}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-card border border-line bg-surface p-0 text-ink shadow-[var(--shadow)] backdrop:bg-black/45 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <section className="flex max-h-[min(88vh,52rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              iconOnly
              aria-label="Close"
              title="Close"
              onClick={onClose}
              disabled={closeDisabled}
              icon={<X size={18} strokeWidth={1.75} aria-hidden />}
            />
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
              {footer}
            </footer>
          )}
        </section>
      )}
    </dialog>
  );
}
