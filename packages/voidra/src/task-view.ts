import { hash } from "./lifecycle.ts";
import type { ProjectInspection } from "./project.ts";
import { type Action, schemas } from "./schemas.ts";

export type TaskColumn = "backlog" | "todo" | "in-progress" | "review" | "done";
export interface TaskView {
  id: string;
  kind: "action" | "idea";
  title: string;
  body: string;
  path: string;
  revision: string;
  column: TaskColumn;
  archived: boolean;
  stage: string | null;
  status: string;
  type: string | null;
  assignee: string | null;
  parent: string | null;
  blockedBy: string[];
  sourceIdea: string | null;
  targetRelease: string | null;
  releaseAssigned: boolean;
}

/** Board organization never changes the lifecycle or grants an approval. */
export function taskColumn(action: Action, hasRun = false): TaskColumn {
  if (action.stage === "cancelled") return "backlog";
  if (action.status === "complete" || action.releasedIn) return "done";
  if (action.stage === "review") return "review";
  if (
    action.status === "running" ||
    action.status === "failed" ||
    action.stage === "verify" ||
    hasRun ||
    (action.doneBy === "you" && action.status === "waiting")
  )
    return "in-progress";
  if (action.status === "draft" || action.taskColumn === "backlog")
    return "backlog";
  return "todo";
}

/** Rebuildable projection: promoted idea IDs remain provenance, not duplicate cards. */
export function projectTasks(project: ProjectInspection): TaskView[] {
  const valid = [...project.records.entries()].filter(
    ([path]) =>
      !project.diagnostics.some(
        (d) => d.file === path && ["identity", "duplicate-id"].includes(d.code),
      ),
  );
  const actionIds = new Set(
    valid
      .filter(([, r]) => r.kind === "action")
      .map(([, r]) => r.document.data.id),
  );
  const sources = new Map<string, string>();
  const promoted = new Set<string>();
  const ran = new Set(
    valid
      .filter(([, r]) => r.kind === "run")
      .map(([, r]) => r.document.data.action),
  );
  for (const [, record] of valid) {
    if (record.kind !== "idea") continue;
    const idea = schemas.idea.parse(record.document.data);
    if (
      idea.status === "promoted" &&
      idea.promotedTo &&
      actionIds.has(idea.promotedTo)
    ) {
      sources.set(idea.promotedTo, idea.id);
      promoted.add(idea.id);
    }
  }
  const tasks: TaskView[] = [];
  for (const [path, record] of valid) {
    if (record.kind !== "action" && record.kind !== "idea") continue;
    const data =
      record.kind === "action"
        ? schemas.action.parse(record.document.data)
        : schemas.idea.parse(record.document.data);
    if (record.kind === "idea" && promoted.has(data.id)) continue;
    const action = record.kind === "action" ? schemas.action.parse(data) : null;
    tasks.push({
      id: data.id,
      kind: record.kind,
      title: data.title,
      body: record.document.body,
      path,
      revision: hash(record.document.raw),
      column: action ? taskColumn(action, ran.has(data.id)) : "backlog",
      archived: action?.stage === "cancelled" || data.status === "rejected",
      stage: action?.stage ?? null,
      status: data.status,
      type: data.type ?? null,
      assignee: data.assignee ?? null,
      parent: action?.parent ?? null,
      blockedBy: action?.blockedBy ?? [],
      sourceIdea: sources.get(data.id) ?? null,
      targetRelease: data.targetRelease ?? null,
      releaseAssigned: data.targetRelease !== undefined,
    });
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}
