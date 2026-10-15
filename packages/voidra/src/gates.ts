import { z } from "zod";
import {
  approvalCurrent,
  hash,
  planFiles,
  projectLifecycles,
  transition,
} from "./lifecycle.ts";
import {
  blockingPlanningDiagnostics,
  checkProject,
  type ProjectInspection,
  readPlan,
} from "./project.ts";
import { serializeRecord } from "./records.ts";
import { checkReleasePreparation } from "./release-preparation.ts";
import { questionSchema, schemas } from "./schemas.ts";
import { applyOperation, type WriteOptions } from "./writer.ts";

const answerInput = z.strictObject({
  action: schemas.action.shape.id,
  question: questionSchema.shape.id,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  by: z.string().min(1),
  answer: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("choice"), choice: z.string().min(1) }),
    z.strictObject({ kind: z.literal("text"), text: z.string().min(1) }),
    z.strictObject({ kind: z.literal("agent-decides") }),
  ]),
});
export async function answerQuestion(
  root: string,
  raw: z.input<typeof answerInput>,
): Promise<void> {
  const input = answerInput.parse(raw),
    project = await checkProject(root);
  if (blockingPlanningDiagnostics(project).length > 0)
    throw new Error("Fix planning-file problems before answering");
  if (project.files.has(".voidra/local/run.lock"))
    throw new Error("Finish or recover the run before answering");
  const path = `.voidra/actions/${input.action}/questions.md`,
    record = project.records.get(path)?.document,
    actionPath = `.voidra/actions/${input.action}/action.md`,
    actionDoc = project.records.get(actionPath)?.document;
  if (!record || !actionDoc) throw new Error("Action questions not found");
  if (hash(record.raw) !== input.revision)
    throw new Error("Questions changed on disk; reload before answering");
  const questions = schemas.questions.parse(record.data),
    question = questions.rounds
      .flatMap((r) => r.questions)
      .find((q) => q.id === input.question),
    action = schemas.action.parse(actionDoc.data);
  if (!question) throw new Error("Question not found");
  if (
    action.status === "complete" ||
    ["done", "released", "cancelled"].includes(action.stage ?? "")
  )
    throw new Error(
      "Finished answers are part of history; create a new action",
    );
  const answer = input.answer;
  if (
    answer.kind === "choice" &&
    !question.options.some((o) => o.label === answer.choice)
  )
    throw new Error("Choose an available option");
  if (input.answer.kind === "text" && !question.allowFreeText)
    throw new Error("Free text is unavailable for this question");
  question.answer = {
    ...input.answer,
    by: input.by,
    at: new Date().toISOString(),
  };
  delete question.agentChoice;
  const open = questions.rounds.some((r) => r.questions.some((q) => !q.answer));
  // Finishing a round resumes the agent even when a previous plan exists.
  action.status = open ? "waiting" : "ready";
  action.updatedAt = new Date().toISOString();
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: input.revision,
        content: serializeRecord(record, questions).toString(),
      },
      {
        path: actionPath,
        expectedHash: hash(actionDoc.raw),
        content: serializeRecord(actionDoc, action).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ],
  });
}

function decisionProject(project: ProjectInspection): void {
  if (blockingPlanningDiagnostics(project).length > 0)
    throw new Error("Fix planning-file problems before deciding");
  if (project.files.has(".voidra/local/run.lock"))
    throw new Error("Finish or recover the run before deciding");
}
function reviewFiles(
  project: ProjectInspection,
  id: string,
): [string, Buffer][] {
  const action = project.records.get(`.voidra/actions/${id}/action.md`)
    ?.document.data;
  const extra = new Set<string>();
  if (action?.type === "release" && Array.isArray(action.releaseActions)) {
    if (typeof action.releaseVersion === "string")
      extra.add(`.voidra/releases/${action.releaseVersion}.md`);
    for (const member of action.releaseActions)
      if (typeof member === "string")
        extra.add(`.voidra/actions/${member}/action.md`);
  }
  return [...project.files].filter(
    ([path]) => path.startsWith(`.voidra/actions/${id}/`) || extra.has(path),
  );
}
export function reviewRevision(project: ProjectInspection, id: string): string {
  return hash(
    JSON.stringify(
      reviewFiles(project, id)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, bytes]) => [path, hash(bytes)]),
    ),
  );
}
export async function requestPlanChanges(
  root: string,
  id: string,
  revision: string,
  feedback: string,
  by: string,
  options: WriteOptions = {},
): Promise<void> {
  if (!feedback.trim()) throw new Error("Explain the changes needed");
  const project = await checkProject(
    root,
    options.lifecycles ? { lifecycles: options.lifecycles } : {},
  );
  decisionProject(project);
  const plan = readPlan(project.files, id, project.records);
  if (!plan || plan.revision !== revision)
    throw new Error("Plan revision changed; reload before deciding");
  const path = `.voidra/actions/${id}/action.md`,
    doc = project.records.get(path)?.document;
  if (!doc) throw new Error("Action not found");
  const questionPath = `.voidra/actions/${id}/questions.md`,
    questions = project.records.get(questionPath)?.document;
  if (
    questions &&
    schemas.questions
      .parse(questions.data)
      .rounds.some((r) =>
        r.questions.some(
          (q) =>
            !q.answer || (q.answer.kind === "agent-decides" && !q.agentChoice),
        ),
      )
  )
    throw new Error(
      "Complete questions and delegated choices before deciding the plan",
    );
  let action = schemas.action.parse(doc.data);
  if (
    action.doneBy !== "agent" ||
    !["plan", "implement", "verify", "review"].includes(action.stage ?? "")
  )
    throw new Error("No plan gate at this stage");
  if (action.stage !== "plan" && approvalCurrent(action.planApproval, plan))
    throw new Error("No plan approval gate at this stage");
  if (action.stage !== "plan")
    action = transition(
      action,
      "advance",
      { plan },
      options.lifecycles ?? projectLifecycles(project.metadata),
    ).action;
  action = transition(
    action,
    "reject-plan",
    { plan },
    options.lifecycles ?? projectLifecycles(project.metadata),
  ).action;
  const next = {
    ...action,
    planFeedback: {
      feedback,
      by,
      at: new Date().toISOString(),
      revision,
    },
  };
  await applyOperation(
    root,
    {
      changes: [
        {
          path,
          expectedHash: hash(doc.raw),
          content: serializeRecord(doc, next).toString(),
        },
        ...planFiles.map((file) => {
          const path = `.voidra/actions/${id}/${file}`,
            raw = project.files.get(path) as Buffer;
          return { path, expectedHash: hash(raw), content: raw.toString() };
        }),
        {
          path: questionPath,
          expectedHash: questions ? hash(questions.raw) : null,
          content: questions ? questions.raw.toString() : null,
        },
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      ],
    },
    options,
  );
}
export async function decideReview(
  root: string,
  id: string,
  revision: string,
  decision: "accepted" | "rejected",
  feedback: string,
  by: string,
  options: WriteOptions = {},
): Promise<void> {
  const project = await checkProject(
    root,
    options.lifecycles ? { lifecycles: options.lifecycles } : {},
  );
  decisionProject(project);
  if (reviewRevision(project, id) !== revision)
    throw new Error("Review revision changed; reload before deciding");
  const path = `.voidra/actions/${id}/action.md`,
    doc = project.records.get(path)?.document;
  if (!doc) throw new Error("Action not found");
  let action = schemas.action.parse(doc.data);
  const plan = readPlan(project.files, id, project.records);
  if (action.stage !== "review")
    throw new Error("No review gate at this stage");
  const runs = [...project.records.values()].filter(
    (r) => r.kind === "run" && r.document.data.action === id,
  );
  if (
    !runs.some(
      (r) =>
        r.document.data.toStage === "review" &&
        ["advanced", "waiting"].includes(String(r.document.data.outcome)) &&
        r.document.data.endedAt &&
        (["research", "release"].includes(action.type) ||
          r.document.data.commit),
    )
  )
    throw new Error("A completed result for this review is required");
  if (decision === "rejected" && !feedback.trim())
    throw new Error("Explain the changes needed before rejecting");
  const questions = project.records.get(`.voidra/actions/${id}/questions.md`);
  const questionsOpen = questions
    ? schemas.questions
        .parse(questions.document.data)
        .rounds.some((r) =>
          r.questions.some(
            (q) =>
              !q.answer ||
              (q.answer.kind === "agent-decides" && !q.agentChoice),
          ),
        )
    : false;
  if (
    action.type === "release" &&
    action.reviewDecision &&
    action.reviewDecision.revision !== plan?.revision
  ) {
    const { reviewDecision, ...rest } = action;
    action = {
      ...rest,
      reviewHistory: [
        ...(Array.isArray(action.reviewHistory) ? action.reviewHistory : []),
        reviewDecision,
      ],
    };
  }
  if (decision === "accepted" && action.releasePreparation)
    await checkReleasePreparation(
      root,
      project,
      action.releasePreparation,
      action.releaseActions ?? [],
    );
  const current = action.type === "release" ? plan?.revision : revision;
  const next = transition(
    action,
    decision === "accepted" ? "accept-review" : "reject-review",
    {
      ...(plan ? { plan } : {}),
      ...(current ? { revision: current } : {}),
      reviewRevision: revision,
      questionsOpen,
      by,
      at: new Date().toISOString(),
    },
    options.lifecycles ?? projectLifecycles(project.metadata),
  ).action;
  if (next.reviewDecision && decision === "rejected")
    next.reviewDecision.feedback = feedback;
  await applyOperation(
    root,
    {
      changes: [
        {
          path,
          expectedHash: hash(doc.raw),
          content: serializeRecord(doc, next).toString(),
        },
        ...reviewFiles(project, id)
          .filter(([file]) => file !== path)
          .map(([path, raw]) => ({
            path,
            expectedHash: hash(raw),
            content: raw.toString(),
          })),
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      ],
    },
    options,
  );
}
