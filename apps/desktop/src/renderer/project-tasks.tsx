"use client";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actionTypeSchema, type WorkspaceSnapshot } from "../shared/bridge.ts";
import { actionLabels } from "./action-labels.ts";
import { request } from "./app.tsx";
import { ProjectActions } from "./project-actions.tsx";
import { ProjectBacklog } from "./project-backlog.tsx";
import { useWorkspace } from "./project-profile.tsx";
import { TaskCapture } from "./task-capture.tsx";
import {
  filterTasks,
  type TaskFilters,
  taskReleaseOptions,
} from "./task-filters.ts";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { ErrorState, PageHeader } from "./ui/page.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { useToast } from "./ui/toast.tsx";

type Task = WorkspaceSnapshot["tasks"][number];
const columns = [
  ["backlog", "Backlog"],
  ["planning", "Planning"],
  ["todo", "TODO"],
  ["in-progress", "In progress"],
  ["review", "Review"],
  ["done", "Done"],
] as const;
type Column = (typeof columns)[number][0];
type Drag = {
  task: Task;
  pointer: number;
  x: number;
  y: number;
  moved: boolean;
  latestX: number;
  latestY: number;
  board: HTMLElement;
  bounds: DOMRect;
};

const destination = (x: number, y: number): Column | null => {
  const value = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-task-column]")?.dataset.taskColumn;
  return columns.find(([id]) => id === value)?.[0] ?? null;
};

function scrollWhileDragging(
  drag: { current: Drag | null },
  onHover: (column: Column | null) => void,
) {
  const gesture = drag.current;
  const tick = () => {
    const current = drag.current;
    if (!current || current !== gesture) return;
    if (current.moved) {
      const direction =
        current.latestX < current.bounds.left + 32
          ? -1
          : current.latestX > current.bounds.right - 32
            ? 1
            : 0;
      if (direction) {
        const before = current.board.scrollLeft;
        current.board.scrollLeft += direction * 12;
        if (before !== current.board.scrollLeft)
          onHover(destination(current.latestX, current.latestY));
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function ProjectTasks({
  onAction,
  onIdea,
  selectedIdea,
  selectedAction,
  onTasks,
  navigationEpoch,
}: {
  onAction: (id: string) => void;
  onIdea: (id: string | null) => void;
  selectedIdea: string | null;
  selectedAction: string | null;
  onTasks: () => void;
  navigationEpoch: number;
}) {
  const workspace = useWorkspace(true),
    query = useQueryClient(),
    toast = useToast();
  const [filters, setFilters] = useState<TaskFilters>({
    release: "all",
    archived: false,
    type: "all",
    status: "all",
    assignee: "all",
  });
  const [capture, setCapture] = useState<"action" | "idea" | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [hover, setHover] = useState<Column | null>(null);
  const [notice, setNotice] = useState<{ message: string; task: Task } | null>(
    null,
  );
  const drag = useRef<Drag | null>(null);
  const filterRef = useRef(filters);
  filterRef.current = filters;
  const focusAfterMove = useRef<{ id: string; origin: Element | null } | null>(
    null,
  );
  useEffect(
    () => () => {
      drag.current = null;
    },
    [],
  );
  useEffect(() => {
    const create = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.isComposing ||
        event.key.toLowerCase() !== "n" ||
        document.querySelector("dialog[open]")
      )
        return;
      const button = document.querySelector<HTMLButtonElement>(
        "button[data-new-task]",
      );
      if (!button || button.disabled || !button.getClientRects().length) return;
      event.preventDefault();
      button.click();
    };
    window.addEventListener("keydown", create);
    return () => window.removeEventListener("keydown", create);
  }, []);
  const data = workspace.data;
  const visible = useMemo(
    () =>
      filterTasks(
        data?.tasks ?? [],
        filters,
        data?.projectRelease.version ?? null,
      ),
    [data?.tasks, filters, data?.projectRelease.version],
  );
  const grouped = useMemo(() => {
    const groups = new Map<Column, Task[]>(columns.map(([id]) => [id, []]));
    for (const task of visible) groups.get(task.column)?.push(task);
    return groups;
  }, [visible]);
  const titles = useMemo(
    () => new Map(data?.tasks.map((task) => [task.id, task.title]) ?? []),
    [data?.tasks],
  );
  const releaseOptions = useMemo(
    () => (data ? taskReleaseOptions(data) : []),
    [data],
  );
  const editable =
    !!data &&
    !data.readOnly &&
    data.lock.state === "none" &&
    !data.recoveries.length &&
    !data.planning.pending.length;
  const movable =
    editable && !!data?.taskTracking && !data.diagnostics.length && !busy;
  const move = useCallback(
    async (task: Task, column: Column) => {
      if (column === task.column) return;
      setBusy(task.id);
      setNotice(null);
      const origin = document.activeElement;
      try {
        if (
          task.kind === "idea" &&
          ["planning", "todo"].includes(column) &&
          !task.type
        )
          throw Error(
            "Open this Backlog task and choose an action type with Promote before moving it to TODO.",
          );
        const response = await request({
          command: "move-task",
          id: task.id,
          revision: task.revision,
          column,
          ...(task.kind === "idea" && task.type
            ? { type: actionTypeSchema.parse(task.type) }
            : {}),
        });
        await query.invalidateQueries({ queryKey: ["workspace"] });
        const moved =
          response.kind === "workspace"
            ? response.workspace.tasks.find(
                (item) => item.id === task.id || item.sourceIdea === task.id,
              )
            : null;
        const hidden =
          moved &&
          response.kind === "workspace" &&
          !filterTasks(
            [moved],
            filterRef.current,
            response.workspace.projectRelease.version,
          ).length;
        focusAfterMove.current = { id: moved?.id ?? task.id, origin };
        toast.success(
          `Moved to ${columns.find(([id]) => id === column)?.[1]}${hidden ? ". Hidden by the current filters." : ""}`,
        );
      } catch (cause) {
        setNotice({
          message:
            cause instanceof Error ? cause.message : "Could not move task",
          task,
        });
        await query.invalidateQueries({ queryKey: ["workspace"] });
        focusAfterMove.current = { id: task.id, origin };
      } finally {
        setBusy(null);
      }
    },
    [query, toast],
  );
  useEffect(() => {
    if (busy || !focusAfterMove.current) return;
    const pending = focusAfterMove.current;
    focusAfterMove.current = null;
    if (
      document.activeElement !== pending.origin &&
      document.activeElement !== document.body
    )
      return;
    const handle = document.querySelector<HTMLButtonElement>(
      `button[data-task-grip="${pending.id}"]`,
    );
    const target = handle?.getClientRects().length
      ? handle
      : document.querySelector<HTMLSelectElement>(
          "select[data-task-release-filter]",
        );
    target?.focus();
  }, [busy]);
  const open = useCallback(
    (task: Task) =>
      task.kind === "action" ? onAction(task.id) : onIdea(task.id),
    [onAction, onIdea],
  );
  if (workspace.isPending) return <Spinner label="Reading tasks" />;
  if (workspace.isError || !data)
    return (
      <ErrorState
        error={workspace.error}
        onRetry={() => void workspace.refetch()}
      />
    );
  return (
    <>
      <div hidden={!!selectedAction || !!selectedIdea}>
        <PageHeader
          title="Tasks"
          actions={
            <div className="flex gap-2">
              <Button
                variant="primary"
                icon={<Plus size={16} aria-hidden />}
                data-new-task
                title="Add task (Cmd/Ctrl+N)"
                disabled={!editable}
                onClick={() => setCapture("action")}
              >
                Add task
              </Button>
            </div>
          }
        />
        {data.lock.state !== "none" && (
          <p role="status" className="service-notice mb-5">
            {data.lock.message}
          </p>
        )}
        {data.recoveries.map((item) => (
          <p key={`${item.kind}:${item.id}`} className="service-notice mb-5">
            {item.message}
          </p>
        ))}
        {!!data.diagnostics.length && (
          <section
            aria-label="Planning problems"
            className="service-notice mb-5"
          >
            <h2>Planning files needing attention</h2>
            <ul>
              {data.diagnostics.map((item) => (
                <li key={`${item.code}:${item.file}:${item.field}`}>
                  <code>{item.file}</code>: {item.message}
                  {/^\.voidra\/actions\/(act-[0-9a-hjkmnp-tv-z]{6})\//.test(
                    item.file,
                  ) && (
                    <Button
                      variant="ghost"
                      onClick={() => onAction(item.file.split("/")[2] ?? "")}
                    >
                      Open affected task
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <form
          className="board-filters task-filter-strip mb-5"
          aria-label="Task filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field label="Release">
            <select
              className="input"
              data-task-release-filter
              value={filters.release}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  release: event.target.value,
                }))
              }
            >
              <option value="all">All releases</option>
              <option value="current" disabled={!data.projectRelease.version}>
                Current
                {data.projectRelease.version
                  ? ` · ${data.projectRelease.version}`
                  : " · unavailable"}
              </option>
              {releaseOptions
                .filter((version) => version !== data.projectRelease.version)
                .map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              <option value="unassigned">Unassigned Backlog</option>
            </select>
          </Field>
          <Field label="Type">
            <select
              className="input"
              value={filters.type}
              onChange={(event) =>
                setFilters((value) => ({ ...value, type: event.target.value }))
              }
            >
              <option value="all">All types</option>
              {actionTypeSchema.options.map((type) => (
                <option key={type} value={type}>
                  {actionLabels[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className="input"
              value={filters.status}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  status: event.target.value,
                }))
              }
            >
              <option value="all">All statuses</option>
              {[...new Set(data.tasks.map((task) => task.status))]
                .sort()
                .map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select
              className="input"
              value={filters.assignee}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  assignee: event.target.value,
                }))
              }
            >
              <option value="all">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {[
                ...new Set(
                  data.tasks.flatMap((task) =>
                    task.assignee ? [task.assignee] : [],
                  ),
                ),
              ]
                .sort()
                .map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
            </select>
          </Field>
        </form>
        <label className="flex items-center gap-2 mb-5">
          <input
            type="checkbox"
            checked={filters.archived}
            onChange={(event) =>
              setFilters((value) => ({
                ...value,
                archived: event.target.checked,
              }))
            }
          />
          Include deleted, cancelled and rejected tasks
        </label>
        <p role="status" className="text-muted mb-4">
          {visible.length} matching {visible.length === 1 ? "task" : "tasks"}
        </p>
        {notice && (
          <section role="status" className="service-notice mb-5">
            <p>{notice.message}</p>
            <Button onClick={() => open(notice.task)}>Open task steps</Button>
          </section>
        )}
        <section
          className="actions-board tasks-board"
          aria-label="Tasks board"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Empty filtered boards still need keyboard scrolling.
          tabIndex={0}
        >
          {columns.map(([id, title]) => (
            <section
              key={id}
              data-task-column={id}
              data-drop-target={hover === id || undefined}
              className="board-column task-column"
              aria-label={`${title} tasks`}
            >
              <h2 className="mb-3">
                {title}{" "}
                <span className="badge">{grouped.get(id)?.length ?? 0}</span>
              </h2>
              <ul className="space-y-3">
                {grouped.get(id)?.map((task) => (
                  <li key={task.id}>
                    <TaskCard
                      task={task}
                      disabled={!movable}
                      busy={busy === task.id}
                      parentTitle={
                        task.parent ? titles.get(task.parent) : undefined
                      }
                      onParent={onAction}
                      onOpen={open}
                      onMove={move}
                      drag={drag}
                      onHover={setHover}
                    />
                  </li>
                ))}
              </ul>
              {!grouped.get(id)?.length && (
                <p className="text-sm text-muted">No tasks</p>
              )}
            </section>
          ))}
        </section>
        {capture && (
          <TaskCapture
            kind={capture}
            data={data}
            onClose={() => setCapture(null)}
          />
        )}
      </div>
      {selectedAction && (
        <ProjectActions
          key={`${selectedAction}:${navigationEpoch}`}
          view="actions"
          initialAction={selectedAction}
          onBack={onTasks}
        />
      )}
      {selectedIdea && (
        <ProjectBacklog
          key={selectedIdea}
          selectedId={selectedIdea}
          onBack={() => onIdea(null)}
        />
      )}
    </>
  );
}

const TaskCard = memo(function TaskCard({
  task,
  disabled,
  busy,
  onOpen,
  onParent,
  parentTitle,
  onMove,
  drag,
  onHover,
}: {
  task: Task;
  disabled: boolean;
  busy: boolean;
  onOpen: (task: Task) => void;
  onParent: (id: string) => void;
  parentTitle: string | undefined;
  onMove: (task: Task, column: Column) => Promise<void>;
  drag: { current: Drag | null };
  onHover: (column: Column | null) => void;
}) {
  const next: Column =
    task.column === "backlog"
      ? "planning"
      : task.column === "planning"
        ? "todo"
        : task.column === "todo"
          ? "in-progress"
          : "planning";
  const nextLabel = columns.find(([id]) => id === next)?.[1] ?? next;
  return (
    <article className="card action-detail task-card">
      <div className="flex items-start gap-2">
        <Button
          className="task-drag-handle"
          data-task-grip={task.id}
          onPointerDown={(event) => {
            if (event.button !== 0 || disabled || drag.current) return;
            const board =
              event.currentTarget.closest<HTMLElement>(".tasks-board");
            if (!board) return;
            drag.current = {
              task,
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              latestX: event.clientX,
              latestY: event.clientY,
              moved: false,
              board,
              bounds: board.getBoundingClientRect(),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            scrollWhileDragging(drag, onHover);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (
              !current ||
              current.pointer !== event.pointerId ||
              current.task.id !== task.id
            )
              return;
            current.latestX = event.clientX;
            current.latestY = event.clientY;
            if (
              Math.hypot(
                event.clientX - current.x,
                event.clientY - current.y,
              ) >= 4
            )
              current.moved = true;
            if (current.moved)
              onHover(destination(event.clientX, event.clientY));
          }}
          onPointerUp={(event) => {
            const current = drag.current;
            if (
              !current ||
              current.pointer !== event.pointerId ||
              current.task.id !== task.id
            )
              return;
            drag.current = null;
            onHover(null);
            if (!current.moved) return;
            const column = destination(event.clientX, event.clientY);
            if (column) void onMove(current.task, column);
          }}
          onPointerCancel={(event) => {
            if (
              drag.current?.pointer !== event.pointerId ||
              drag.current.task.id !== task.id
            )
              return;
            drag.current = null;
            onHover(null);
          }}
          onLostPointerCapture={(event) => {
            if (
              drag.current?.pointer !== event.pointerId ||
              drag.current.task.id !== task.id ||
              event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            drag.current = null;
            onHover(null);
          }}
          iconOnly
          icon={<GripVertical size={16} aria-hidden />}
          aria-label={`Move ${task.title}; use left or right arrow`}
          title="Drag to a column, or use left and right arrows"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Escape" && drag.current) {
              event.preventDefault();
              drag.current = null;
              onHover(null);
              return;
            }
            if (
              !["ArrowLeft", "ArrowRight"].includes(event.key) ||
              event.altKey ||
              event.metaKey ||
              event.ctrlKey
            )
              return;
            event.preventDefault();
            const index = columns.findIndex(([id]) => id === task.column),
              destination =
                columns[index + (event.key === "ArrowRight" ? 1 : -1)];
            if (destination) void onMove(task, destination[0]);
          }}
        />
        <Button variant="ghost" onClick={() => onOpen(task)}>
          {task.title}
        </Button>
      </div>
      <p className="text-sm text-muted">
        {task.type ?? "Idea"} · {task.stage ?? task.status}
      </p>
      {task.parent && (
        <Button
          variant="ghost"
          onClick={() => task.parent && onParent(task.parent)}
        >
          Slices of {parentTitle ?? task.parent}
        </Button>
      )}
      {task.sourceIdea && (
        <p className="text-sm text-muted">From {task.sourceIdea}</p>
      )}
      {task.assignee && <p className="text-sm">{task.assignee}</p>}
      {!!task.blockedBy.length && (
        <p className="text-sm">Dependencies: {task.blockedBy.join(", ")}</p>
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
          {task.deleted
            ? "Deleted"
            : task.status === "rejected"
              ? "Rejected"
              : "Cancelled"}
        </span>
      )}
      {!task.archived &&
        ["backlog", "planning", "todo", "in-progress", "review"].includes(
          task.column,
        ) && (
          <Button
            className="mt-3"
            disabled={disabled}
            loading={busy}
            aria-label={`Move ${task.title} to ${nextLabel}`}
            onClick={() => void onMove(task, next)}
          >
            Move to {nextLabel}
          </Button>
        )}
    </article>
  );
});
