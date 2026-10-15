"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { WorkspaceSnapshot } from "../shared/bridge.ts";
import { request } from "./app.tsx";
import { useWorkspace } from "./project-profile.tsx";
import { ProjectReleaseSource } from "./project-release-source.tsx";
import { TaskTrackingUpgrade } from "./task-tracking-upgrade.tsx";
import { Button } from "./ui/button.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

const columns = [
  ["backlog", "Backlog"],
  ["todo", "TODO"],
  ["in-progress", "In progress"],
  ["review", "Review"],
  ["done", "Done"],
] as const;

export function ProjectTasks({
  onAction,
  onBacklog,
}: {
  onAction: (id: string) => void;
  onBacklog: () => void;
}) {
  const workspace = useWorkspace(true);
  const [archived, setArchived] = useState(false);
  if (workspace.isPending) return <Spinner label="Reading tasks" />;
  if (workspace.isError)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  const tasks = workspace.data.tasks.filter(
    (task) => archived || !task.archived,
  );
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Plan your work and follow each task through its coding-agent lifecycle."
      />
      <ProjectReleaseSource data={workspace.data} />
      <TaskTrackingUpgrade data={workspace.data} />
      {workspace.data.lock.state !== "none" && (
        <p role="status" className="service-notice mb-5">
          {workspace.data.lock.message}
        </p>
      )}
      {workspace.data.recoveries.map((item) => (
        <p key={`${item.kind}:${item.id}`} className="service-notice mb-5">
          {item.message}
        </p>
      ))}
      {workspace.data.diagnostics.length > 0 && (
        <section aria-label="Planning problems" className="service-notice mb-5">
          <h2>Planning files needing attention</h2>
          <ul>
            {workspace.data.diagnostics.map((item) => (
              <li key={`${item.code}:${item.file}:${item.field}`}>
                {item.file}: {item.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      <label className="flex items-center gap-2 mb-5">
        <input
          type="checkbox"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
        />
        Include cancelled and rejected tasks
      </label>
      <section className="actions-board" aria-label="Tasks board">
        {columns.map(([id, title]) => (
          <section
            key={id}
            className="board-column"
            aria-label={`${title} tasks`}
          >
            <h2 className="mb-3">
              {title}{" "}
              <span className="badge">
                {tasks.filter((task) => task.column === id).length}
              </span>
            </h2>
            <ul className="space-y-3">
              {tasks
                .filter((task) => task.column === id)
                .map((task) => (
                  <li key={task.id} className="card action-detail">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        task.kind === "action" ? onAction(task.id) : onBacklog()
                      }
                    >
                      {task.title}
                    </Button>
                    <p className="text-sm text-muted">
                      {task.type ?? "Idea"} · {task.stage ?? task.status}
                    </p>
                    {task.parent && (
                      <p className="text-sm">Child of {task.parent}</p>
                    )}
                    {task.sourceIdea && (
                      <p className="text-sm text-muted">
                        From {task.sourceIdea}
                      </p>
                    )}
                    {task.assignee && (
                      <p className="text-sm">{task.assignee}</p>
                    )}
                    {task.blockedBy.length > 0 && (
                      <p className="text-sm">
                        Dependencies: {task.blockedBy.join(", ")}
                      </p>
                    )}
                    <p className="text-sm text-muted">
                      {task.targetRelease
                        ? `Release ${task.targetRelease}`
                        : task.releaseAssigned
                          ? "No release"
                          : "Legacy task · release not assigned"}
                    </p>
                    {task.archived && (
                      <span className="badge">
                        {task.status === "rejected" ? "Rejected" : "Cancelled"}
                      </span>
                    )}
                    <TaskPlacement task={task} data={workspace.data} />
                  </li>
                ))}
            </ul>
            {!tasks.some((task) => task.column === id) && (
              <p className="text-sm text-muted">No tasks</p>
            )}
          </section>
        ))}
      </section>
    </>
  );
}

function TaskPlacement({
  task,
  data,
}: {
  task: WorkspaceSnapshot["tasks"][number];
  data: WorkspaceSnapshot;
}) {
  const [busy, setBusy] = useState(false),
    query = useQueryClient(),
    toast = useToast();
  if (
    !data.taskTracking ||
    task.kind !== "action" ||
    task.archived ||
    task.status !== "ready" ||
    !["backlog", "todo"].includes(task.column)
  )
    return null;
  const next = task.column === "backlog" ? "todo" : "backlog";
  const label = next === "todo" ? "TODO" : "Backlog";
  async function move() {
    setBusy(true);
    try {
      await request({
        command: "move-task",
        id: task.id,
        revision: task.revision,
        column: next,
      });
      await query.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(`Moved to ${label}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not move task",
      );
      await query.invalidateQueries({ queryKey: ["workspace"] });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      className="mt-3"
      aria-label={`Move ${task.title} to ${label}`}
      disabled={
        busy ||
        data.readOnly ||
        data.lock.state !== "none" ||
        data.recoveries.length > 0 ||
        data.planning.pending.length > 0 ||
        data.diagnostics.length > 0
      }
      loading={busy}
      onClick={() => void move()}
    >
      Move to {label}
    </Button>
  );
}
