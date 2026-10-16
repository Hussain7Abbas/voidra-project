import { approvalCurrent, projectLifecycles } from "./lifecycle.ts";
import { type ProjectInspection, readPlan } from "./project.ts";
import { type Action, schemas } from "./schemas.ts";

export type TaskRunKind = "planning" | "implementation" | "quality";
export function taskRunKind(action: Action): TaskRunKind | null {
  if (
    action.taskWorkflow !== 1 ||
    action.type === "release" ||
    action.doneBy !== "agent" ||
    action.deletedAt ||
    action.status === "complete" ||
    action.stage === "cancelled"
  )
    return null;
  if (action.stage === "review") return "quality";
  return action.taskColumn === "planning"
    ? "planning"
    : action.taskColumn === "in-progress"
      ? "implementation"
      : null;
}
export function taskFullyPlanned(
  project: ProjectInspection,
  action: Action,
): boolean {
  const questions = project.records.get(
    `.voidra/actions/${action.id}/questions.md`,
  );
  if (
    action.taskWorkflow === 1 &&
    (!questions ||
      schemas.questions
        .parse(questions.document.data)
        .rounds.every((round) => round.questions.length === 0))
  )
    return false;
  if (
    questions &&
    schemas.questions
      .parse(questions.document.data)
      .rounds.some((round) =>
        round.questions.some(
          (q) =>
            !q.answer || (q.answer.kind === "agent-decides" && !q.agentChoice),
        ),
      )
  )
    return false;
  return projectLifecycles(project.metadata)[action.type].planGate
    ? approvalCurrent(
        action.planApproval,
        readPlan(project.files, action.id, project.records),
      )
    : action.workflowPlanned === true &&
        !!readPlan(project.files, action.id, project.records);
}
