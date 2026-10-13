export interface ActionFilterView {
  data: {
    id: string;
    title: string;
    type: string;
    status: string;
    doneBy: string;
    assignee?: string | undefined;
    parent?: string | undefined;
    stage?: string | undefined;
  };
}
export interface ActionFilters {
  type: string;
  status: string;
  doneBy: string;
  assignee: string;
}
export function filterActionViews<T extends ActionFilterView>(
  actions: T[],
  filter: ActionFilters,
): T[] {
  return actions.filter(
    (a) =>
      (filter.type === "all" || a.data.type === filter.type) &&
      (filter.status === "all" || a.data.status === filter.status) &&
      (filter.doneBy === "all" || a.data.doneBy === filter.doneBy) &&
      (filter.assignee === "all" ||
        (filter.assignee === "unassigned"
          ? !a.data.assignee
          : a.data.assignee === filter.assignee)),
  );
}
export function groupActionViews<T extends ActionFilterView>(
  all: T[],
  visible: T[],
): { parent: T | undefined; actions: T[] }[] {
  const groups = new Map<string, { parent: T | undefined; actions: T[] }>();
  for (const item of visible) {
    const id = item.data.parent ?? item.data.id;
    let group = groups.get(id);
    if (!group) {
      group = { parent: all.find((a) => a.data.id === id), actions: [] };
      groups.set(id, group);
    }
    group.actions.push(item);
  }
  return [...groups.values()];
}
