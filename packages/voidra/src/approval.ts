import { VoidraError } from "./errors.ts";
import {
  approvalCurrent,
  hash,
  type PlanRevision,
  planFiles,
  projectLifecycles,
  transition,
} from "./lifecycle.ts";
import { checkProject, type ProjectInspection, readPlan } from "./project.ts";
import { serializeRecord } from "./records.ts";
import { checkReleasePreparation } from "./release-preparation.ts";
import { schemas } from "./schemas.ts";
import {
  applyOperation,
  type OperationResult,
  type WriteOptions,
} from "./writer.ts";

async function load(
  root: string,
  id: string,
  options: WriteOptions = {},
): Promise<{ checked: ProjectInspection; plan: PlanRevision }> {
  if (!/^act-[0-9a-hjkmnp-tv-z]{6}$/.test(id))
    throw new VoidraError("id", id, "Invalid action ID");
  const checked = await checkProject(
    root,
    options.lifecycles ? { lifecycles: options.lifecycles } : {},
  );
  const gate = checked.diagnostics.find(
    (d) => d.code === "newer-format" || d.code === "migration-required",
  );
  if (gate)
    throw new VoidraError(
      gate.code,
      gate.file,
      gate.message,
      gate.field,
      gate.line,
    );
  const plan = readPlan(checked.files, id, checked.records);
  if (!plan)
    throw new VoidraError(
      "missing-plan",
      `.voidra/actions/${id}`,
      "Plan files are missing or invalid",
    );
  const problem = checked.diagnostics.find(
    (d) => !["stale-approval", "stale-review"].includes(d.code),
  );
  if (problem)
    throw new VoidraError(
      problem.code,
      problem.file,
      problem.message,
      problem.field,
      problem.line,
    );
  return { checked, plan };
}
export async function getPlanRevision(
  root: string,
  id: string,
  options: WriteOptions = {},
): Promise<PlanRevision> {
  return (await load(root, id, options)).plan;
}
export async function approveAction(
  root: string,
  id: string,
  by: string,
  revision: string,
  options: WriteOptions = {},
): Promise<OperationResult> {
  const { checked, plan } = await load(root, id, options);
  if (plan.revision !== revision)
    throw new VoidraError(
      "stale-revision",
      `.voidra/actions/${id}`,
      "Displayed plan revision has changed",
    );
  const path = `.voidra/actions/${id}/action.md`;
  const record = checked.records.get(path)?.document;
  if (!record)
    throw new VoidraError(
      "missing-action",
      path,
      "Action is missing or invalid",
    );
  let action = schemas.action.parse(record.data);
  const rules = options.lifecycles ?? projectLifecycles(checked.metadata);
  const questions = checked.records.get(`.voidra/actions/${id}/questions.md`);
  const questionsOpen = questions
    ? schemas.questions
        .parse(questions.document.data)
        .rounds.some((round) =>
          round.questions.some(
            (q) =>
              !q.answer ||
              (q.answer.kind === "agent-decides" && !q.agentChoice),
          ),
        )
    : false;
  const context = {
    plan,
    revision,
    by,
    at: new Date().toISOString(),
    questionsOpen,
  };
  if (action.type === "release") {
    if (action.releasePreparation)
      await checkReleasePreparation(
        root,
        checked,
        action.releasePreparation,
        action.releaseActions ?? [],
      );
    if (action.reviewDecision && action.reviewDecision.revision !== revision) {
      const { reviewDecision, ...rest } = action;
      action = {
        ...rest,
        reviewHistory: [
          ...(Array.isArray(action.reviewHistory) ? action.reviewHistory : []),
          reviewDecision,
        ],
      };
    }
    action = transition(action, "accept-review", context, rules).action;
  } else {
    if (
      rules[action.type].planGate &&
      action.stage !== "plan" &&
      !approvalCurrent(action.planApproval, plan)
    )
      action = transition(action, "advance", context, rules).action;
    action = transition(action, "approve-plan", context, rules).action;
  }
  const changes: {
    path: string;
    expectedHash: string | null;
    content: string | null;
  }[] = planFiles.map((file) => {
    const filePath = `.voidra/actions/${id}/${file}`;
    const bytes = checked.files.get(filePath) as Buffer;
    return {
      path: filePath,
      expectedHash: hash(bytes),
      content: bytes.toString(),
    };
  });
  changes.push({
    path,
    expectedHash: hash(record.raw),
    content: serializeRecord(record, action).toString(),
  });
  changes.push({
    path: `.voidra/actions/${id}/questions.md`,
    expectedHash: questions ? hash(questions.document.raw) : null,
    content: questions ? questions.document.raw.toString() : null,
  });
  changes.push({
    path: ".voidra/local/run.lock",
    expectedHash: null,
    content: null,
  });
  return applyOperation(root, { changes }, options);
}
