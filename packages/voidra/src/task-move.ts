import { z } from "zod";
import { readActionSequence, withActionSequence } from "./action-sequence.ts";
import { hash, projectLifecycles } from "./lifecycle.ts";
import { promoteIdea } from "./planning.ts";
import { checkProject, PACKAGE_VERSION } from "./project.ts";
import { serializeRecord } from "./records.ts";
import { hashSchema, schemas } from "./schemas.ts";
import { newTaskFields } from "./task-metadata.ts";
import { projectTasks } from "./task-view.ts";
import { taskFullyPlanned } from "./task-workflow.ts";
import { applyOperation } from "./writer.ts";

const moveInput = z.strictObject({
  id: z.union([schemas.action.shape.id, schemas.idea.shape.id]),
  revision: hashSchema,
  column: z.enum([
    "backlog",
    "planning",
    "todo",
    "in-progress",
    "review",
    "done",
  ]),
  type: schemas.action.shape.type.optional(),
  by: z.string().min(1).default("You"),
});

/** Organize unstarted work without changing lifecycle gates or approvals. */
export async function moveTask(
  root: string,
  raw: z.input<typeof moveInput>,
): Promise<string> {
  const input = moveInput.parse(raw),
    project = await checkProject(root);
  if (project.metadata?.taskTracking !== 1)
    throw Error("Enable task tracking before moving tasks");
  if (project.diagnostics.length)
    throw Error("Resolve planning-file problems before moving tasks");
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (r) =>
        (r.kind === "run" && r.document.data.outcome === "running") ||
        (r.kind === "operation" && r.document.data.state === "prepared"),
    )
  )
    throw Error("Finish or recover pending work before moving tasks");
  const task = projectTasks(project).find((task) => task.id === input.id);
  if (!task) throw Error("Task not found");
  if (task.revision !== input.revision)
    throw Error("Task changed on disk; refresh before moving it");
  if (task.archived) throw Error("Archived tasks cannot be moved");
  if (input.column === task.column) return task.id;
  if (task.kind === "idea" && input.column === "planning") {
    if (!input.type) throw Error("Choose an action type before Planning");
    return promoteIdea(root, {
      id: task.id,
      revision: input.revision,
      type: input.type,
      by: input.by,
      taskColumn: "planning",
      taskWorkflow: 1,
    });
  }
  if (
    task.kind === "action" &&
    (project.records.get(task.path)?.document.data.taskWorkflow === 1 ||
      input.column === "planning")
  ) {
    const doc = project.records.get(task.path)?.document;
    if (!doc) throw Error("Task source missing");
    const action = schemas.action.parse(doc.data);
    if (
      action.status === "draft" ||
      action.doneBy !== "agent" ||
      action.type === "release"
    )
      throw Error("Use this task's existing activation or release gate");
    if (input.column === "done" || input.column === "review")
      throw Error(
        "Review and completion require owned implementation and QA/security results",
      );
    if (
      ["todo", "in-progress"].includes(input.column) &&
      !taskFullyPlanned(project, action)
    )
      throw Error(
        "Finish questions and approve the exact plan in Planning first",
      );
    if (input.column === "in-progress" && task.column !== "todo")
      throw Error(
        "Move fully planned work through TODO before starting implementation",
      );
    const fields = await newTaskFields(root, project, "action", {
      taskWorkflow: 1,
      taskColumn: input.column,
      targetRelease:
        input.column === "backlog"
          ? action.targetRelease
          : (action.targetRelease ?? undefined),
    });
    const next = {
      ...action,
      ...fields,
      status: "ready" as const,
      updatedAt: new Date().toISOString(),
    };
    if (task.column === "done" && input.column !== "planning")
      throw Error(
        "Reopen completed work in Planning before changing its requirements",
      );
    if (input.column === "planning") {
      delete next.qualityRun;
      if (next.planApproval)
        next.approvalHistory = [
          ...(next.approvalHistory ?? []),
          next.planApproval,
        ];
      delete next.planApproval;
      next.workflowPlanned = false;
      next.stage = projectLifecycles(project.metadata)[
        action.type
      ].stages.includes("discovery")
        ? "discovery"
        : projectLifecycles(project.metadata)[action.type].planGate
          ? "plan"
          : action.type === "docs"
            ? "implement"
            : "discovery";
    }
    if (task.column === "review" && ["todo", "backlog"].includes(input.column))
      next.stage = projectLifecycles(project.metadata)[action.type].rejectTo;
    const metadata = project.files.get(".voidra/voidra.json");
    if (!metadata) throw Error("Project metadata missing");
    await applyOperation(
      root,
      withActionSequence(
        project,
        {
          changes: [
            {
              path: task.path,
              expectedHash: input.revision,
              content: serializeRecord(doc, next).toString(),
            },
            {
              path: ".voidra/voidra.json",
              expectedHash: hash(metadata),
              content: `${JSON.stringify({ ...project.metadata, requiredVoidra: PACKAGE_VERSION }, null, 2)}\n`,
            },
            {
              path: ".voidra/local/run.lock",
              expectedHash: null,
              content: null,
            },
            {
              path: ".voidra/local/planning.lock",
              expectedHash: null,
              content: null,
            },
          ],
        },
        input.by,
      ),
    );
    return task.id;
  }
  if (
    !["backlog", "todo"].includes(input.column) ||
    !["backlog", "todo"].includes(task.column)
  )
    throw Error("Run, review and completion columns follow lifecycle gates");
  if (task.kind === "idea") {
    if (!input.type)
      throw Error("Choose an action type before moving an idea to TODO");
    return promoteIdea(root, {
      id: task.id,
      revision: input.revision,
      type: input.type,
      by: input.by,
    });
  }
  const doc = project.records.get(task.path)?.document;
  if (!doc) throw Error("Task source missing");
  const action = schemas.action.parse(doc.data);
  if (action.status !== "ready")
    throw Error(
      "Activate drafts and resolve lifecycle gates before moving tasks",
    );
  const fields = await newTaskFields(
    root,
    project,
    "action",
    {
      taskColumn: input.column as "backlog" | "todo",
      targetRelease:
        input.column === "todo"
          ? (action.targetRelease ?? undefined)
          : action.targetRelease,
    },
    false,
  );
  const metadata = project.files.get(".voidra/voidra.json");
  if (!metadata) throw Error("Project metadata missing");
  await applyOperation(
    root,
    withActionSequence(
      project,
      {
        changes: [
          {
            path: task.path,
            expectedHash: input.revision,
            content: serializeRecord(doc, {
              ...doc.data,
              ...fields,
            }).toString(),
          },
          {
            path: ".voidra/voidra.json",
            expectedHash: hash(metadata),
            content: metadata.toString(),
          },
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
  );
  return task.id;
}

/** Remove the card and execution intent while keeping its canonical history and references reversible. */
export async function deleteTask(
  root: string,
  raw: { id: string; revision: string; by?: string },
): Promise<void> {
  const input = moveInput
    .pick({ id: true, revision: true, by: true })
    .parse(raw);
  const project = await checkProject(root),
    task = projectTasks(project).find((task) => task.id === input.id);
  if (!task || task.revision !== input.revision)
    throw Error("Task changed or is missing; refresh before deleting");
  if (task.deleted) throw Error("This task is already deleted");
  if (
    project.diagnostics.length ||
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (record) =>
        (record.kind === "run" && record.document.data.outcome === "running") ||
        (record.kind === "operation" &&
          record.document.data.state === "prepared"),
    )
  )
    throw Error("Finish or recover pending work before deleting a task");
  if (
    projectTasks(project).some(
      (other) =>
        !other.archived &&
        other.column !== "done" &&
        (other.parent === task.id || other.blockedBy.includes(task.id)),
    )
  )
    throw Error(
      "Resolve unfinished subtasks and dependent tasks before deleting this task",
    );
  const doc = project.records.get(task.path)?.document,
    metadata = project.files.get(".voidra/voidra.json");
  if (!doc || !metadata) throw Error("Task source is missing");
  const sequence = readActionSequence(project);
  if (sequence.problems.length)
    throw Error("Repair the Actions sequence before deleting tasks");
  const queuePath = ".voidra/local/pending-actions.md",
    queue = project.records.get(queuePath)?.document,
    pending = queue
      ? [...queue.body.matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g)].map(
          (match) => match[0],
        )
      : [],
    cancellingRelease =
      doc.data.type === "release" &&
      !["released", "cancelled"].includes(String(doc.data.stage));
  await applyOperation(
    root,
    withActionSequence(
      project,
      {
        changes: [
          ...(!sequence.enabled && queue && pending.includes(input.id)
            ? [
                {
                  path: queuePath,
                  expectedHash: hash(queue.raw),
                  content: serializeRecord(
                    queue,
                    {
                      ...queue.data,
                      queuedBy: input.by,
                      queuedAt: new Date().toISOString(),
                    },
                    pending
                      .filter((id) => id !== input.id)
                      .map((id, index) => `${index + 1}. [ ] ${id}`)
                      .join("\n") + "\n",
                  ).toString(),
                },
              ]
            : []),
          {
            path: task.path,
            expectedHash: input.revision,
            content: serializeRecord(doc, {
              ...doc.data,
              deletedAt: new Date().toISOString(),
              ...(cancellingRelease
                ? {
                    deletedState: {
                      stage: doc.data.stage,
                      status: doc.data.status,
                    },
                    stage: "cancelled",
                    status: "complete",
                  }
                : {}),
              ...(task.kind === "idea"
                ? { status: "rejected", reason: "Deleted" }
                : {}),
            }).toString(),
          },
          {
            path: ".voidra/voidra.json",
            expectedHash: hash(metadata),
            content: `${JSON.stringify({ ...project.metadata, requiredVoidra: PACKAGE_VERSION }, null, 2)}\n`,
          },
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
  );
}
