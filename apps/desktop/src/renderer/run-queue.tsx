"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { Button } from "./ui/button.tsx";
import { useToast } from "./ui/toast.tsx";

export function RunQueue({
  data,
  editable,
}: {
  data: WorkspaceSnapshot;
  editable: boolean;
}) {
  const query = useQueryClient(),
    toast = useToast();
  const [busy, setBusy] = useState(false);
  const eligible = data.actions
    .filter((a) => a.queueable && !data.queue.includes(a.data.id))
    .sort((a, b) => {
      const rank = (assignee?: string) =>
        !assignee || assignee === data.identity.value ? 0 : 1;
      return (
        rank(a.data.assignee) - rank(b.data.assignee) ||
        a.data.title.localeCompare(b.data.title)
      );
    });
  async function save(ids: string[]) {
    setBusy(true);
    try {
      await request({
        command: "replace-queue",
        ids: ids.filter(
          (id) =>
            data.sequence.enabled ||
            data.actions.some((a) => a.data.id === id && a.queueable),
        ),
        revision: data.queueRevision,
        revisions: Object.fromEntries(
          data.actions.map((a) => [a.data.id, a.editRevision]),
        ),
      });
      await query.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("Queue saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      await query.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, offset: number) {
    const ids = [...data.queue],
      target = index + offset;
    const first = ids[index],
      other = ids[target];
    if (!first || !other) return;
    ids[index] = other;
    ids[target] = first;
    void save(ids);
  }
  return (
    <>
      <section className="card action-detail" aria-label="Run queue">
        <h2>Queued actions</h2>
        <p className="text-muted">
          {data.sequence.enabled
            ? "Execution requests follow the Actions sidebar order. Blocked requests wait; consumed requests return only when you explicitly queue them again."
            : "Actions run in this order. Your queue is saved on this machine. Actions that are no longer ready are removed when you update the queue."}
        </p>
        {data.queue.length ? (
          <ol>
            {data.queue.map((id, index) => {
              const action = data.actions.find((a) => a.data.id === id),
                title = action?.data.title ?? id;
              return (
                <li key={id} className="queue-item">
                  <div>
                    <strong>{title}</strong>
                    {action && !action.queueable && <p>{action.queueReason}</p>}
                  </div>
                  <div className="queue-controls">
                    {!data.sequence.enabled && (
                      <>
                        <Button
                          aria-label={`Move ${title} earlier`}
                          disabled={!editable || busy || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          Move up
                        </Button>
                        <Button
                          aria-label={`Move ${title} later`}
                          disabled={
                            !editable || busy || index === data.queue.length - 1
                          }
                          onClick={() => move(index, 1)}
                        >
                          Move down
                        </Button>
                      </>
                    )}
                    <Button
                      aria-label={`Remove ${title} from queue`}
                      disabled={!editable || busy}
                      onClick={() =>
                        void save(data.queue.filter((value) => value !== id))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>Choose an action to queue.</p>
        )}
      </section>
      <section className="card action-detail" aria-label="Available actions">
        <h2>Available actions</h2>
        <p className="text-muted">
          Yours and unassigned actions appear first. Answer questions and
          approve plans before queueing them again. Activate Profile change
          drafts from their action page.
        </p>
        {eligible.length ? (
          <ul>
            {eligible.map((action) => (
              <li key={action.data.id} className="queue-item">
                <div>
                  <strong>{action.data.title}</strong>
                  <p className="text-muted">
                    {action.data.assignee ?? "Unassigned"}
                  </p>
                </div>
                <Button
                  disabled={!editable || busy}
                  aria-label={`Add ${action.data.title} to queue`}
                  onClick={() => void save([...data.queue, action.data.id])}
                >
                  Add to queue
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No more actions are ready for the agent.</p>
        )}
      </section>
    </>
  );
}
