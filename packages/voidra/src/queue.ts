import { z } from "zod";
import { withActionSequence } from "./action-sequence.ts";
import { actionComplete, hash } from "./lifecycle.ts";
import {
  blockingPlanningDiagnostics,
  checkProject,
  type ProjectInspection,
} from "./project.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { schemas } from "./schemas.ts";
import { newTaskFields } from "./task-metadata.ts";
import { taskFullyPlanned, taskRunKind } from "./task-workflow.ts";
import { applyOperation, type WriteOptions } from "./writer.ts";

export function queueDecision(
  project: ProjectInspection,
  id: string,
  options: { activatingProfileDraft?: boolean; stopAtStalePlan?: boolean } = {},
): { allowed: boolean; reason: string | null } {
  const refused = (reason: string) => ({ allowed: false, reason });
  const record = project.records.get(`.voidra/actions/${id}/action.md`);
  if (record?.kind !== "action")
    return refused(
      project.files.has(`.voidra/actions/${id}/action.md`)
        ? "Repair this action’s fields before queueing"
        : "Action not found",
    );
  const parsed = schemas.action.safeParse(record.document.data);
  if (!parsed.success)
    return refused("Repair this action’s fields before queueing");
  const action = parsed.data;
  const kind = taskRunKind(action);
  if (action.deletedAt) return refused("This task is deleted");
  if (
    action.taskWorkflow === 1 &&
    action.type !== "release" &&
    action.doneBy === "agent"
  ) {
    if (!kind)
      return refused(
        action.taskColumn === "todo"
          ? "Move planned work to In progress to queue implementation"
          : "Move this task to Planning to begin discovery",
      );
    if (
      kind === "implementation" &&
      !taskFullyPlanned(project, action) &&
      !(
        options.stopAtStalePlan &&
        project.diagnostics.some(
          (d) =>
            d.code === "stale-approval" &&
            d.file.startsWith(`.voidra/actions/${id}/`),
        )
      )
    )
      return refused(
        "Finish questions and approve the exact plan before implementation",
      );
  }
  if (
    (action.taskColumn === "backlog" ||
      (project.metadata?.taskTracking === 1 && action.status === "draft")) &&
    !(
      options.activatingProfileDraft &&
      action.type === "profile-change" &&
      action.status === "draft"
    )
  )
    return refused("Move this task to TODO with a release before queueing it");
  const questionData = project.records.get(`.voidra/actions/${id}/questions.md`)
    ?.document.data;
  const questions = questionData
    ? schemas.questions.safeParse(questionData)
    : null;
  if (
    questions?.success &&
    questions.data.rounds.some((r) => r.questions.some((q) => !q.answer))
  )
    return refused("Answer the open questions before queueing");
  if (
    action.stage === "review" &&
    action.type !== "release" &&
    kind !== "quality" &&
    !questionData
  )
    return refused("Review gate needs a human decision");
  if (
    project.diagnostics.some(
      (d) =>
        d.file.startsWith(`.voidra/actions/${id}/`) &&
        !(options.stopAtStalePlan && d.code === "stale-approval"),
    )
  )
    return refused(
      "Resolve this action’s planning-file problems before queueing",
    );
  if (
    action.type === "profile-change" &&
    action.status === "draft" &&
    !options.activatingProfileDraft
  )
    return refused("Review and activate the Profile change draft first");
  if (
    action.doneBy !== "agent" ||
    !(
      kind === "quality"
        ? ["ready", "waiting", "failed"]
        : ["ready", "draft", "failed"]
    ).includes(action.status) ||
    ["done", "released", "cancelled"].includes(action.stage ?? "")
  )
    return refused("This action cannot be queued at its current gate");
  for (const id of kind === "planning" ? [] : (action.blockedBy ?? [])) {
    const dep = project.records.get(`.voidra/actions/${id}/action.md`),
      parsed = schemas.action.safeParse(dep?.document.data);
    if (!parsed.success || !actionComplete(parsed.data))
      return refused(
        "This action is blocked; finish the blocking actions before queueing",
      );
  }
  if (
    kind !== "planning" &&
    [...project.records.values()].some(
      (r) =>
        r.kind === "action" &&
        r.document.data.parent === id &&
        (!schemas.action.safeParse(r.document.data).success ||
          !actionComplete(schemas.action.parse(r.document.data))),
    )
  )
    return refused("Complete the child slices before queueing their parent");
  return { allowed: true, reason: null };
}
const queueInput = z.strictObject({
  ids: z
    .array(schemas.action.shape.id)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Duplicate queued action",
    ),
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  by: z.string().min(1),
  revisions: z
    .record(schemas.action.shape.id, z.string().regex(/^[a-f0-9]{64}$/))
    .optional(),
  activate: z
    .object({
      id: schemas.action.shape.id,
      revision: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
});
export async function replaceActionQueue(
  root: string,
  raw: z.input<typeof queueInput>,
  options: WriteOptions = {},
): Promise<void> {
  const input = queueInput.parse(raw),
    project = await checkProject(root);
  if (!project.metadata || blockingPlanningDiagnostics(project).length > 0)
    throw new Error("Fix planning-file problems before editing the queue");
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock")
  )
    throw new Error(
      "Finish or recover the active run before editing the queue",
    );
  if (
    [...project.records.values()].some(
      (r) => r.kind === "run" && r.document.data.outcome === "running",
    )
  )
    throw new Error(
      "Finish or recover the unfinished run before editing the queue",
    );
  const path = ".voidra/local/pending-actions.md",
    bytes = project.files.get(path);
  if ((bytes ? hash(bytes) : null) !== input.revision)
    throw new Error("Queue changed on disk; refresh before editing");
  const ordered = project.records.get(path)?.document.data.orderedIntent === 1;
  const existing = new Set(
    project.records
      .get(path)
      ?.document.body.match(/act-[0-9a-hjkmnp-tv-z]{6}/g) ?? [],
  );
  for (const id of input.ids) {
    const actionBytes = project.files.get(`.voidra/actions/${id}/action.md`);
    if (
      input.revisions &&
      input.revisions[id] !== (actionBytes ? hash(actionBytes) : null)
    )
      throw new Error("Action changed on disk; refresh before queueing");
    if (
      input.activate?.id === id &&
      input.activate.revision !== (actionBytes ? hash(actionBytes) : null)
    )
      throw new Error("Profile change draft changed; review it again");
    const decision = queueDecision(project, id, {
      activatingProfileDraft: input.activate?.id === id,
    });
    if (
      !decision.allowed &&
      !(ordered && existing.has(id) && input.activate?.id !== id)
    )
      throw new Error(decision.reason ?? "Cannot queue this action");
  }
  const doc = bytes
    ? parseRecord(path, bytes)
    : parseRecord(path, "---\n{}\n---\n");
  const draft = project.records.get(
    `.voidra/actions/${input.activate?.id}/action.md`,
  )?.document.data;
  const activation =
    project.metadata.taskTracking === 1 &&
    input.ids.includes(input.activate?.id ?? "") &&
    draft?.type === "profile-change" &&
    draft.status === "draft"
      ? await newTaskFields(
          root,
          project,
          "action",
          {
            taskColumn: draft.taskWorkflow === 1 ? "planning" : "todo",
            taskWorkflow: draft.taskWorkflow === 1 ? 1 : undefined,
            targetRelease:
              (draft.targetRelease as string | undefined) || undefined,
          },
          false,
        )
      : {};
  await applyOperation(
    root,
    withActionSequence(
      project,
      {
        changes: [
          {
            path,
            expectedHash: input.revision,
            content: serializeRecord(
              doc,
              {
                ...doc.data,
                queuedBy: input.by,
                queuedAt: new Date().toISOString(),
              },
              input.ids.map((id, i) => `${i + 1}. [ ] ${id}`).join("\n"),
            ).toString(),
          },
          ...[...project.files]
            .filter(([file]) => !file.startsWith(".voidra/local/"))
            .map(([path, bytes]) => {
              const record = project.records.get(path);
              const activate =
                path === `.voidra/actions/${input.activate?.id}/action.md` &&
                input.ids.includes(String(record?.document.data.id)) &&
                record?.document.data.type === "profile-change" &&
                record.document.data.status === "draft";
              return {
                path,
                expectedHash: hash(bytes),
                content:
                  activate && record
                    ? serializeRecord(record.document, {
                        ...record.document.data,
                        ...activation,
                        status: "ready",
                        activatedBy: input.by,
                        activatedAt: new Date().toISOString(),
                      }).toString()
                    : bytes.toString(),
              };
            }),
          { path: ".voidra/local/run.lock", expectedHash: null, content: null },
          {
            path: ".voidra/local/planning.lock",
            expectedHash: null,
            content: null,
          },
        ],
      },
      input.by,
    ),
    options,
  );
}
