"use client";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { BridgeRequest, WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { useCodingClient } from "./coding-client.tsx";
import { Button } from "./ui/button.tsx";
import { useToast } from "./ui/toast.tsx";

type Reorder = Extract<BridgeRequest, { command: "replace-action-sequence" }>;
type Gesture = {
  id: string;
  pointer: number;
  y: number;
  moved: boolean;
  proposal: Reorder;
  target: string;
  latestY: number;
};
function reordered(ids: string[], id: string, target: string): string[] {
  const from = ids.indexOf(id),
    to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export const ActionsSidebar = memo(function ActionsSidebar({
  data,
  onAction,
}: {
  data: WorkspaceSnapshot;
  onAction: (id: string) => void;
}) {
  const query = useQueryClient(),
    toast = useToast(),
    client = useCodingClient();
  const [busy, setBusy] = useState(false),
    [hover, setHover] = useState<string | null>(null),
    [failed, setFailed] = useState<Reorder | null>(null);
  const gesture = useRef<Gesture | null>(null),
    list = useRef<HTMLOListElement | null>(null);
  const sequence = data.sequence;
  const actions = useMemo(
    () => new Map(data.actions.map((action) => [action.data.id, action])),
    [data.actions],
  );
  const editable =
    !busy &&
    !data.readOnly &&
    data.lock.state === "none" &&
    !data.recoveries.length &&
    !data.planning.pending.length &&
    !sequence.problems.length;
  const proposal = (): Reorder | null =>
    sequence.revision
      ? {
          command: "replace-action-sequence",
          revision: sequence.revision,
          queueRevision: data.queueRevision,
          order: [...sequence.order],
          revisions: Object.fromEntries(
            data.actions.map((action) => [action.data.id, action.editRevision]),
          ),
        }
      : null;
  async function save(input: Reorder, focusId?: string) {
    setBusy(true);
    setFailed(null);
    try {
      await request(input);
      await query.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("Actions order saved");
      if (focusId)
        requestAnimationFrame(() => {
          const grip = list.current?.querySelector<HTMLButtonElement>(
            `[data-sequence-grip="${focusId}"]`,
          );
          grip?.focus();
          grip?.scrollIntoView({ block: "nearest" });
        });
    } catch (cause) {
      setFailed(input);
      toast.error(cause instanceof Error ? cause.message : String(cause));
      await query.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        gesture.current = null;
        setHover(null);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => {
      gesture.current = null;
      window.removeEventListener("keydown", cancel);
    };
  }, []);
  function scrollDrag() {
    const tick = () => {
      const drag = gesture.current,
        container = list.current;
      if (!drag || !container) return;
      if (drag.moved) {
        const bounds = container.getBoundingClientRect();
        container.scrollTop +=
          drag.latestY < bounds.top + 32
            ? -10
            : drag.latestY > bounds.bottom - 32
              ? 10
              : 0;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return (
    <aside
      id="actions-sidebar"
      className="actions-sidebar"
      aria-label="Actions"
      tabIndex={-1}
    >
      <header>
        <h2>
          Actions <span className="text-muted">{sequence.order.length}</span>
        </h2>
        <p className="text-muted">Implementation sequence</p>
      </header>
      {!sequence.enabled && (
        <div className="sequence-notice">
          <p>
            {data.taskTracking
              ? "Enable the saved sequence for this project. Existing requests are preserved; unstarted TODO work joins once."
              : "Enable task tracking in Tasks → Release settings to enroll TODO work automatically."}
          </p>
          {sequence.preview && (
            <>
              <p>
                {sequence.preview.order.length} tasks ·{" "}
                {sequence.preview.pending.length} pending requests
              </p>
              <Button
                disabled={!editable}
                onClick={async () => {
                  const preview = sequence.preview;
                  if (!preview) return;
                  setBusy(true);
                  try {
                    await request({
                      command: "enable-action-sequence",
                      revision: preview.revision,
                    });
                    await query.invalidateQueries({ queryKey: ["workspace"] });
                  } catch (cause) {
                    toast.error(String(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Enable Actions sequence
              </Button>
            </>
          )}
        </div>
      )}
      {sequence.problems.map((problem) => (
        <p role="alert" key={problem}>
          {problem}
        </p>
      ))}
      {failed && (
        <section className="sequence-notice" aria-label="Unsaved Actions order">
          <p>
            The order could not be saved. Your proposed order is retained below
            for review; current tasks have refreshed.
          </p>
          <ol>
            {failed.order.map((id) => (
              <li key={id}>{actions.get(id)?.data.title ?? id}</li>
            ))}
          </ol>
          <Button onClick={() => setFailed(null)}>
            Dismiss proposed order
          </Button>
        </section>
      )}
      {!!sequence.warnings.length && (
        <section
          className="sequence-notice"
          aria-label="Dependency order warning"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The warning list scrolls independently and can contain no focusable Rearrange control.
          tabIndex={0}
        >
          <h3>Dependency order needs attention</h3>
          <ul>
            {sequence.warnings.map((warning) => (
              <li key={`${warning.task}-${warning.dependency}`}>
                {actions.get(warning.task)?.data.title ?? warning.task} needs{" "}
                {actions.get(warning.dependency)?.data.title ??
                  warning.dependency}
                {warning.kind === "later"
                  ? ", listed later."
                  : warning.kind === "absent"
                    ? ", outside this sequence."
                    : ", which is missing."}
              </li>
            ))}
          </ul>
          {sequence.rearranged && (
            <Button
              disabled={!editable}
              onClick={() => {
                const input = proposal();
                if (input && sequence.rearranged)
                  void save({ ...input, order: sequence.rearranged });
              }}
            >
              Rearrange
            </Button>
          )}
          <p className="text-muted">
            You can keep this order. The agent still waits for prerequisites.
          </p>
        </section>
      )}
      <ol
        className="sequence-list"
        ref={list}
        aria-label="Implementation order"
      >
        {sequence.order.map((id, index) => {
          const action = actions.get(id),
            title = action?.data.title ?? id;
          return (
            <li
              key={id}
              data-sequence-id={id}
              className={`sequence-entry ${hover === id ? "sequence-drop-target" : ""}`}
            >
              <div className="sequence-entry-heading">
                <button
                  type="button"
                  className="sequence-grip"
                  data-sequence-grip={id}
                  aria-label={`Reorder ${title}; use Up or Down arrow`}
                  disabled={!editable || !sequence.enabled}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                      return;
                    const target =
                        sequence.order[
                          index + (event.key === "ArrowUp" ? -1 : 1)
                        ],
                      input = proposal();
                    if (!target || !input) return;
                    event.preventDefault();
                    void save(
                      { ...input, order: reordered(input.order, id, target) },
                      id,
                    );
                  }}
                  onPointerDown={(event) => {
                    const input = proposal();
                    if (!event.isPrimary || event.button !== 0 || !input)
                      return;
                    gesture.current = {
                      id,
                      pointer: event.pointerId,
                      y: event.clientY,
                      moved: false,
                      proposal: input,
                      target: id,
                      latestY: event.clientY,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    scrollDrag();
                  }}
                  onPointerMove={(event) => {
                    const drag = gesture.current;
                    if (!drag || drag.pointer !== event.pointerId) return;
                    drag.latestY = event.clientY;
                    if (Math.abs(event.clientY - drag.y) > 4) drag.moved = true;
                    if (!drag.moved) return;
                    const target = document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest<HTMLElement>("[data-sequence-id]")
                      ?.dataset.sequenceId;
                    if (target && drag.proposal.order.includes(target)) {
                      drag.target = target;
                      setHover(target);
                    }
                  }}
                  onPointerUp={(event) => {
                    const drag = gesture.current;
                    gesture.current = null;
                    setHover(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    if (drag?.moved && drag.target !== drag.id)
                      void save(
                        {
                          ...drag.proposal,
                          order: reordered(
                            drag.proposal.order,
                            drag.id,
                            drag.target,
                          ),
                        },
                        drag.id,
                      );
                  }}
                  onPointerCancel={() => {
                    gesture.current = null;
                    setHover(null);
                  }}
                  onLostPointerCapture={() => {
                    gesture.current = null;
                    setHover(null);
                  }}
                >
                  <GripVertical size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="sequence-task-link"
                  aria-label={`Open ${title} from Actions`}
                  onClick={() => onAction(id)}
                >
                  {title}
                </button>
              </div>
              <p className="text-muted">
                {action?.data.stage ?? "Task"} ·{" "}
                {sequence.pending.includes(id)
                  ? "Pending"
                  : "No pending request"}
              </p>
              {action && !action.queueable && (
                <p className="text-muted">{action.queueReason}</p>
              )}
              <div className="sequence-controls">
                <Button
                  variant="ghost"
                  disabled={!editable || !sequence.enabled || index === 0}
                  aria-label={`Move ${title} up in Actions`}
                  onClick={() => {
                    const input = proposal(),
                      target = sequence.order[index - 1];
                    if (input && target)
                      void save(
                        { ...input, order: reordered(input.order, id, target) },
                        id,
                      );
                  }}
                >
                  Up
                </Button>
                <Button
                  variant="ghost"
                  disabled={
                    !editable ||
                    !sequence.enabled ||
                    index === sequence.order.length - 1
                  }
                  aria-label={`Move ${title} down in Actions`}
                  onClick={() => {
                    const input = proposal(),
                      target = sequence.order[index + 1];
                    if (input && target)
                      void save(
                        { ...input, order: reordered(input.order, id, target) },
                        id,
                      );
                  }}
                >
                  Down
                </Button>
              </div>
            </li>
          );
        })}
        {!sequence.order.length && (
          <li className="text-muted">Move a task to TODO to add it here.</li>
        )}
      </ol>
      <footer>
        <Button
          onClick={() =>
            void request({ command: "copy-agent-command", agent: client })
              .then(() => toast.success("Command copied"))
              .catch((cause) => toast.error(String(cause)))
          }
        >
          Copy {client === "codex" ? "Codex" : "Claude Code"} Go command
        </Button>
      </footer>
    </aside>
  );
});
