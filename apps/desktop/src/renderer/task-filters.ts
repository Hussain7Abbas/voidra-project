import type { WorkspaceSnapshot } from "../shared/bridge.ts";

type Task = WorkspaceSnapshot["tasks"][number];
const versions = new Intl.Collator("en", { numeric: true });
/** Current and assigned historical versions share one board-only filter. */
export function taskReleaseOptions(
  data: Pick<WorkspaceSnapshot, "tasks" | "releases" | "projectRelease">,
): string[] {
  const known = new Set<string>([
    ...data.tasks.flatMap((task) =>
      task.targetRelease ? [task.targetRelease] : [],
    ),
    ...data.releases.map((release) => release.data.version),
  ]);
  if (data.projectRelease.version) known.add(data.projectRelease.version);
  return [...known].sort((a, b) => {
    const [coreA, ...suffixA] = a.split("-"),
      [coreB, ...suffixB] = b.split("-");
    const core = versions.compare(coreB ?? "", coreA ?? "");
    if (core) return core;
    if (!suffixA.length && suffixB.length) return -1;
    if (suffixA.length && !suffixB.length) return 1;
    return versions.compare(suffixB.join("-"), suffixA.join("-"));
  });
}
export interface TaskFilters {
  release: string;
  archived: boolean;
  type: string;
  status: string;
  assignee: string;
}
export function filterTasks(
  tasks: readonly Task[],
  filter: TaskFilters,
  current: string | null,
): Task[] {
  return tasks.filter(
    (task) =>
      (filter.archived || !task.archived) &&
      (filter.release === "all" ||
        (filter.release === "unassigned"
          ? task.column === "backlog" && !task.targetRelease
          : filter.release === "current"
            ? !!current && task.targetRelease === current
            : task.targetRelease === filter.release)) &&
      (filter.type === "all" || task.type === filter.type) &&
      (filter.status === "all" || task.status === filter.status) &&
      (filter.assignee === "all" ||
        (filter.assignee === "unassigned"
          ? !task.assignee
          : task.assignee === filter.assignee)),
  );
}
