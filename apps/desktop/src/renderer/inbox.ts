import type { WorkspaceSnapshot } from "../shared/bridge.ts";
export type InboxKind =
  | "questions"
  | "plans"
  | "reviews"
  | "human"
  | "inferred";
export interface InboxItem {
  kind: InboxKind;
  id: string;
  title: string;
  action?: string;
  block?: string;
  answer?: string;
}
export function inboxItems(
  workspace: Pick<WorkspaceSnapshot, "actions" | "profiles">,
): InboxItem[] {
  const items: InboxItem[] = [];
  for (const action of workspace.actions) {
    const { data } = action;
    if (data.status === "complete" || data.stage === "cancelled") continue;
    if (data.doneBy === "you") {
      items.push({
        kind: "human",
        id: data.id,
        title: data.title,
        action: data.id,
      });
      continue;
    }
    const open =
      action.questions?.rounds
        .flatMap((r) => r.questions)
        .filter((q) => !q.answer) ?? [];
    for (const q of open)
      items.push({
        kind: "questions",
        id: q.id,
        title: q.text,
        action: data.id,
      });
    if (open.length) continue;
    if (
      action.effectiveStage === "plan" &&
      data.type !== "release" &&
      (data.status === "waiting" || action.changedPlans.length)
    )
      items.push({
        kind: "plans",
        id: data.id,
        title: data.title,
        action: data.id,
      });
    else if (
      data.stage === "review" &&
      (data.status === "waiting" ||
        (data.type === "release" &&
          data.reviewDecision?.decision === "accepted" &&
          action.changedPlans.length))
    )
      items.push({
        kind: "reviews",
        id: data.id,
        title: data.title,
        action: data.id,
      });
  }
  for (const profile of workspace.profiles)
    for (const answer of profile.data.answers)
      if (answer.status === "inferred")
        items.push({
          kind: "inferred",
          id: `${profile.data.block}.${answer.id}`,
          title: answer.question,
          block: profile.data.block,
          answer: answer.id,
        });
  return items;
}
