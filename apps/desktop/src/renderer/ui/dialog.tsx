/* Adapted from storylens dashboard; copyright 2026 Hussain Abbas. AGPL-3.0-or-later. */
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
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
  onClose: () => void | Promise<void>;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const [closeError, setCloseError] = useState(""),
    [pendingClose, setPendingClose] = useState(false);
  async function requestClose() {
    if (closeDisabled || closing.current) return;
    closing.current = true;
    setPendingClose(true);
    setCloseError("");
    const focused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      body = ref.current?.querySelector("section");
    if (body) body.inert = true;
    if (ref.current) ref.current.closedBy = "none";
    try {
      await onClose();
    } catch (cause) {
      setCloseError(
        cause instanceof Error
          ? cause.message
          : "Draft could not be saved. Keep this form open and retry.",
      );
    } finally {
      closing.current = false;
      setPendingClose(false);
      if (body?.isConnected) body.inert = false;
      if (focused?.isConnected && ref.current?.open) focused.focus();
      if (ref.current) ref.current.closedBy = closeDisabled ? "none" : "any";
    }
  }
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setCloseError("");
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
      closedby={closeDisabled || pendingClose ? "none" : "any"}
      aria-busy={pendingClose || undefined}
      onClickCapture={(event) => {
        if (
          !(event.target instanceof Element) ||
          event.target.closest("dialog") !== event.currentTarget ||
          !event.target.closest("[data-dialog-close]")
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        void requestClose();
      }}
      onClose={(event) => {
        if (event.target === event.currentTarget && open && !closing.current) {
          event.currentTarget.showModal();
          void requestClose();
        }
      }}
      onKeyDownCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("dialog") !== event.currentTarget
        )
          return;
        if (
          !(event.metaKey || event.ctrlKey) ||
          event.altKey ||
          event.key.toLowerCase() !== "s" ||
          event.nativeEvent.isComposing
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const forms = event.currentTarget.querySelectorAll("form");
        const form =
          event.target instanceof Element
            ? (event.target.closest("form") ??
              (forms.length === 1 ? forms[0] : null))
            : null;
        if (!form || closeDisabled) return;
        const submit = Array.from(form.elements).find(
          (element): element is HTMLButtonElement =>
            element instanceof HTMLButtonElement &&
            element.type === "submit" &&
            !element.disabled,
        );
        submit?.click();
      }}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!closeDisabled) void requestClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${width} rounded-card border border-line bg-surface p-0 text-ink shadow-[var(--shadow)] backdrop:bg-black/45 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <section
          inert={pendingClose}
          className="flex max-h-[min(88vh,52rem)] flex-col"
        >
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
              onClick={() => void requestClose()}
              disabled={closeDisabled || pendingClose}
              icon={<X size={18} strokeWidth={1.75} aria-hidden />}
            />
          </header>
          <div className="overflow-y-auto px-6 py-5">
            {closeError && <p role="alert">{closeError}</p>}
            {children}
          </div>
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
