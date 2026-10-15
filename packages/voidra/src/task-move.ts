import { z } from "zod";
import { withActionSequence } from "./action-sequence.ts";
import { hash } from "./lifecycle.ts";
import { promoteIdea } from "./planning.ts";
import { checkProject } from "./project.ts";
import { serializeRecord } from "./records.ts";
import { hashSchema, schemas } from "./schemas.ts";
import { newTaskFields } from "./task-metadata.ts";
import { projectTasks } from "./task-view.ts";
import { applyOperation } from "./writer.ts";

const moveInput = z.strictObject({
  id: z.union([schemas.action.shape.id, schemas.idea.shape.id]),
  revision: hashSchema,
  column: z.enum(["backlog", "todo", "in-progress", "review", "done"]),
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
  const fields = await newTaskFields(root, project, "action", {
    taskColumn: input.column as "backlog" | "todo",
    targetRelease:
      input.column === "todo"
        ? (action.targetRelease ?? undefined)
        : action.targetRelease,
  });
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
