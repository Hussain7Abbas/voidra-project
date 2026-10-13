import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { ConfirmDialog } from "./ui/confirm-dialog.tsx";
import { useToast } from "./ui/toast.tsx";

function typing(): boolean {
  const target = document.activeElement;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        ![
          "button",
          "checkbox",
          "radio",
          "range",
          "color",
          "file",
          "submit",
          "reset",
        ].includes(target.type)))
  );
}
interface Confirmation {
  direction: "undo" | "redo";
  revision: string;
  overwriteRevision: string;
  label: string;
  files: string[];
}
export function EditHistory({
  editing,
  onChange,
}: {
  editing: WorkspaceSnapshot["editing"] | undefined;
  onChange: () => Promise<unknown>;
}) {
  const toast = useToast();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [error, setError] = useState<string | undefined>();
  async function replay(
    direction: "undo" | "redo",
    revision: string,
    label: string,
    overwriteRevision?: string,
  ): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await request({
        command: direction,
        revision,
        ...(overwriteRevision ? { overwriteRevision } : {}),
      });
      await onChange();
      setConfirmation(null);
      toast.success(
        `${direction === "undo" ? "Undid" : "Redid"} ${label.toLowerCase()}`,
      );
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Please try again.";
      setError(message);
      toast.error(message);
      await onChange();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function act(direction: "undo" | "redo"): Promise<void> {
    if (busy || inFlight.current || confirmation) return;
    const entry = editing?.[direction];
    if (!entry?.label || !entry.revision) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await request({ command: "workspace" });
      if (response.kind !== "workspace")
        throw new Error("Refresh the project before continuing.");
      const latest = response.workspace.editing[direction];
      if (latest.revision !== entry.revision)
        throw new Error(
          "Undo history changed; review the current edit before continuing.",
        );
      if (latest.blocked) throw new Error(latest.blocked);
      if (latest.conflicts.length && latest.overwriteRevision) {
        setError(undefined);
        setConfirmation({
          direction,
          revision: entry.revision,
          overwriteRevision: latest.overwriteRevision,
          label: entry.label,
          files: latest.conflicts,
        });
        return;
      }
      inFlight.current = false;
      await replay(direction, entry.revision, entry.label);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Please try again.");
      await onChange();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() =>
    window.voidra.subscribe((event) => {
      if (event.type !== "edit-history") return;
      if (typing())
        void request({ command: "text-edit", direction: event.direction });
      else void act(event.direction);
    }),
  );
  useEffect(() => {
    const keyboard = (event: KeyboardEvent): void => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.key.toLowerCase() !== "z" ||
        typing()
      )
        return;
      event.preventDefault();
      void act(event.shiftKey ? "redo" : "undo");
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  });
  useEffect(() => {
    const focus = (): void => {
      void request({ command: "text-edit-focus", editing: typing() });
    };
    document.addEventListener("focusin", focus);
    focus();
    return () => document.removeEventListener("focusin", focus);
  }, []);
  return (
    <>
      <fieldset
        className="flex items-center gap-2 border-0 p-0"
        aria-label="Edit history"
      >
        <Button
          variant="ghost"
          iconOnly
          icon={<Undo2 size={17} aria-hidden />}
          aria-label={`Undo${editing?.undo.label ? ` ${editing.undo.label}` : ""}`}
          title={
            editing?.undo.blocked ??
            `Undo${editing?.undo.label ? ` ${editing.undo.label}` : ""}`
          }
          disabled={busy || !editing?.undo.label}
          onClick={() => void act("undo")}
        />
        <Button
          variant="ghost"
          iconOnly
          icon={<Redo2 size={17} aria-hidden />}
          aria-label={`Redo${editing?.redo.label ? ` ${editing.redo.label}` : ""}`}
          title={
            editing?.redo.blocked ??
            `Redo${editing?.redo.label ? ` ${editing.redo.label}` : ""}`
          }
          disabled={busy || !editing?.redo.label}
          onClick={() => void act("redo")}
        />
      </fieldset>
      {editing?.notice && (
        <p role="status" className="text-sm text-muted">
          {editing.notice}
        </p>
      )}
      <ConfirmDialog
        open={confirmation !== null}
        title="Overwrite changes on disk?"
        confirmLabel={`Overwrite and ${confirmation?.direction ?? "undo"}`}
        busy={busy}
        {...(error ? { error } : {})}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation)
            void replay(
              confirmation.direction,
              confirmation.revision,
              confirmation.label,
              confirmation.overwriteRevision,
            );
        }}
      >
        These files changed since your edit. Continuing replaces their current
        contents with the saved history:
        <ul>
          {confirmation?.files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
