import { z } from "zod";
import { createId } from "./ids.ts";
import {
  actionComplete,
  approvalCurrent,
  hash,
  lifecycles,
  planFiles,
  transition,
} from "./lifecycle.ts";
import {
  checkProject,
  PACKAGE_VERSION,
  type ProjectInspection,
  readPlan,
} from "./project.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { type Action, schemas } from "./schemas.ts";
import { applyOperation, type WriteManifest } from "./writer.ts";

const title = z.string().trim().min(1).max(160);
const description = z.string().min(1).max(20000);
const ideaInput = z.strictObject({
  title,
  description,
  by: z.string().min(1),
  status: z.enum(["new", "needs-info", "ready", "rejected"]).optional(),
  reason: z.string().optional(),
});
const ideaEdit = ideaInput.omit({ by: true }).extend({
  id: schemas.idea.shape.id,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  status: schemas.idea.shape.status,
});

async function planningProject(root: string): Promise<ProjectInspection> {
  const project = await checkProject(root);
  if (!project.metadata || project.diagnostics.length)
    throw new Error("Fix planning-file problems before editing");
  if (
    project.records.has(".voidra/local/run.lock") ||
    [...project.records.values()].some(
      (r) =>
        (r.kind === "run" && r.document.data.outcome === "running") ||
        (r.kind === "operation" && r.document.data.state === "prepared"),
    )
  )
    throw new Error(
      "Finish or recover the run or grouped write before editing",
    );
  return project;
}
const promotionInput = z.strictObject({
  id: schemas.idea.shape.id,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  type: schemas.action.shape.type,
  by: z.string().min(1),
  title: title.optional(),
  description: description.optional(),
  assignee: z.string().min(1).optional(),
});
export async function promoteIdea(
  root: string,
  raw: z.input<typeof promotionInput>,
): Promise<string> {
  const input = promotionInput.parse(raw),
    project = await planningProject(root),
    path = `.voidra/backlog/${input.id}.md`,
    record = project.records.get(path);
  if (record?.kind !== "idea") throw new Error("Idea not found");
  if (hash(record.document.raw) !== input.revision)
    throw new Error("Idea changed on disk; read it again before promotion");
  const idea = schemas.idea.parse(record.document.data);
  if (["promoted", "rejected"].includes(idea.status))
    throw new Error(
      `This idea is ${idea.status}; no duplicate or rejected promotion`,
    );
  const id = createId(
      "act",
      new Set(
        [...project.records.values()].map((r) => String(r.document.data.id)),
      ),
    ),
    actionPath = `.voidra/actions/${id}/action.md`;
  const action = schemas.action.parse({
    id,
    title: input.title ?? idea.title,
    type: input.type,
    stage: lifecycles[input.type].stages[0],
    status: "ready",
    doneBy: "agent",
    ...(input.assignee ? { assignee: input.assignee } : {}),
    links: [idea.id],
    createdBy: input.by,
    createdAt: new Date().toISOString(),
  });
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: input.revision,
        content: serializeRecord(record.document, {
          ...idea,
          status: "promoted",
          promotedTo: id,
        }).toString(),
      },
      {
        path: actionPath,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(actionPath, "---\n{}\n---\n"),
          action,
          input.description ?? record.document.body,
        ).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ],
  });
  return id;
}
function rejection(status: string, reason: string | undefined): void {
  if (status === "rejected" && !reason?.trim())
    throw new Error("A rejection reason is required");
}
const actionInput = z.strictObject({
  type: schemas.action.shape.type,
  title,
  description,
  by: z.string().min(1),
  doneBy: z.enum(["agent", "you"]).default("agent"),
  assignee: z.string().min(1).optional(),
  steps: z.array(z.string().trim().min(1)).optional(),
});
const actionEditInput = z.strictObject({
  id: schemas.action.shape.id,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  title: title.optional(),
  description: description.optional(),
  assignee: z.string().trim().min(1).nullable().optional(),
  parent: schemas.action.shape.id.nullable().optional(),
  blockedBy: z.array(schemas.action.shape.id).optional(),
  cancel: z.boolean().optional(),
});
const stepInput = z.strictObject({
  id: schemas.action.shape.id,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  step: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  done: z.boolean(),
});

async function applyActionChange(
  root: string,
  project: ProjectInspection,
  action: Action,
  body: string,
): Promise<void> {
  const path = `.voidra/actions/${action.id}/action.md`,
    record = project.records.get(path);
  if (!record) throw new Error("Action not found");
  const changes = new Map<string, WriteManifest["changes"][number]>();
  if (action.stage === "cancelled") {
    const queuePath = ".voidra/local/pending-actions.md",
      queue = project.records.get(queuePath)?.document;
    if (queue) {
      const ids = Array.from(
        queue.body.matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g),
        (m) => m[0],
      ).filter((id) => id !== action.id);
      changes.set(queuePath, {
        path: queuePath,
        expectedHash: hash(queue.raw),
        content: serializeRecord(
          queue,
          queue.data,
          ids.map((id, index) => `${index + 1}. [ ] ${id}`).join("\n") +
            (ids.length ? "\n" : ""),
        ).toString(),
      });
    }
  }
  changes.set(path, {
    path,
    expectedHash: hash(record.document.raw),
    content: serializeRecord(record.document, action, body).toString(),
  });
  const actions = new Map(
    [...project.records.values()]
      .filter((r) => r.kind === "action")
      .map((r) => {
        const a = schemas.action.parse(r.document.data);
        return [a.id, a] as const;
      }),
  );
  actions.set(action.id, action);
  const ancestors = new Set<string>();
  for (const start of [
    schemas.action.parse(record.document.data).parent,
    action.parent,
  ]) {
    let id = start;
    while (id && !ancestors.has(id)) {
      ancestors.add(id);
      id = actions.get(id)?.parent;
    }
  }
  let minimum = action.doneBy === "you" && action.stage === "cancelled",
    advanced = true;
  while (advanced) {
    advanced = false;
    for (const id of ancestors) {
      const parent = actions.get(id);
      if (
        !parent ||
        parent.status === "complete" ||
        (parent.type === "release" && parent.doneBy === "agent") ||
        parent.commits?.length
      )
        continue;
      const children = [...actions.values()].filter(
        (child) => child.parent === id,
      );
      if (!children.length || !children.every(actionComplete)) continue;
      if (parent.doneBy === "you" && !parent.steps?.every((step) => step.done))
        continue;
      if (
        [...project.records.values()].some(
          (r) =>
            r.kind === "run" &&
            r.document.data.action === id &&
            ["implement", "verify"].includes(
              String(r.document.data.fromStage),
            ) &&
            r.document.data.planningOnly !== true,
        )
      )
        continue;
      const hasPlan = planFiles.some((file) =>
          project.files.has(`.voidra/actions/${id}/${file}`),
        ),
        plan = readPlan(project.files, id, project.records);
      if (
        parent.doneBy === "agent" &&
        lifecycles[parent.type].planGate &&
        hasPlan &&
        !approvalCurrent(parent.planApproval, plan)
      )
        continue;
      const next: Action = {
        ...parent,
        status: "complete",
        completedBySlices: true,
        updatedAt: new Date().toISOString(),
        ...(parent.doneBy === "agent" ? { stage: "done" as const } : {}),
      };
      const parentPath = `.voidra/actions/${id}/action.md`,
        parentDoc = project.records.get(parentPath)?.document;
      if (!parentDoc) throw new Error("Parent not found");
      changes.set(parentPath, {
        path: parentPath,
        expectedHash: hash(parentDoc.raw),
        content: serializeRecord(parentDoc, next).toString(),
      });
      for (const child of children) {
        const file = `.voidra/actions/${child.id}/action.md`,
          doc = project.records.get(file)?.document;
        if (doc && !changes.has(file))
          changes.set(file, {
            path: file,
            expectedHash: hash(doc.raw),
            content: doc.raw,
          });
      }
      for (const file of planFiles) {
        const name = `.voidra/actions/${id}/${file}`,
          bytes = project.files.get(name);
        changes.set(name, {
          path: name,
          expectedHash: bytes ? hash(bytes) : null,
          content: bytes?.toString() ?? null,
        });
      }
      if (
        parent.doneBy === "agent" &&
        lifecycles[parent.type].planGate &&
        !hasPlan
      )
        minimum = true;
      actions.set(id, next);
      advanced = true;
    }
  }
  if (minimum) {
    const file = ".voidra/voidra.json",
      doc = project.records.get(file)?.document;
    if (!doc) throw new Error("Project metadata not found");
    changes.set(file, {
      path: file,
      expectedHash: hash(doc.raw),
      content: serializeRecord(doc, {
        ...doc.data,
        requiredVoidra: PACKAGE_VERSION,
      }).toString(),
    });
  }
  changes.set(".voidra/local/run.lock", {
    path: ".voidra/local/run.lock",
    expectedHash: null,
    content: null,
  });
  await applyOperation(root, { changes: [...changes.values()] });
}
export async function editAction(
  root: string,
  raw: z.input<typeof actionEditInput>,
): Promise<void> {
  const input = actionEditInput.parse(raw),
    project = await planningProject(root),
    path = `.voidra/actions/${input.id}/action.md`,
    record = project.records.get(path);
  if (record?.kind !== "action") throw new Error("Action not found");
  if (hash(record.document.raw) !== input.revision)
    throw new Error(
      "Action changed on disk; reload or explicitly overwrite its current revision",
    );
  let action = schemas.action.parse(record.document.data);
  if (input.title !== undefined) action.title = input.title;
  if (input.assignee === null) delete action.assignee;
  else if (input.assignee !== undefined) action.assignee = input.assignee;
  if (input.parent === null) delete action.parent;
  else if (input.parent !== undefined) action.parent = input.parent;
  if (input.blockedBy !== undefined) action.blockedBy = input.blockedBy;
  if (input.cancel) {
    action =
      action.doneBy === "you"
        ? { ...action, stage: "cancelled", status: "complete" }
        : transition(action, "cancel", {}).action;
  }
  action.updatedAt = new Date().toISOString();
  await applyActionChange(
    root,
    project,
    action,
    input.description ?? record.document.body,
  );
}
export async function setHumanStep(
  root: string,
  raw: z.input<typeof stepInput>,
): Promise<void> {
  const input = stepInput.parse(raw),
    project = await planningProject(root),
    path = `.voidra/actions/${input.id}/action.md`,
    record = project.records.get(path);
  if (record?.kind !== "action") throw new Error("Action not found");
  if (hash(record.document.raw) !== input.revision)
    throw new Error("Action changed on disk; reread its checklist");
  const action = schemas.action.parse(record.document.data);
  if (action.doneBy !== "you" || !action.steps)
    throw new Error("Checklist steps require a human action");
  if (action.stage === "cancelled")
    throw new Error("Cancelled tasks cannot be checked; create a new task");
  const step = action.steps.find((s) => s.id === input.step);
  if (!step) throw new Error("Step not found");
  step.done = input.done;
  const children = [...project.records.values()]
    .filter((r) => r.kind === "action" && r.document.data.parent === action.id)
    .map((r) => schemas.action.parse(r.document.data));
  action.status = action.steps.every((s) => s.done)
    ? children.every(actionComplete)
      ? "complete"
      : "waiting"
    : "ready";
  action.updatedAt = new Date().toISOString();
  await applyActionChange(root, project, action, record.document.body);
}
export async function createAction(
  root: string,
  raw: z.input<typeof actionInput>,
): Promise<string> {
  const input = actionInput.parse(raw),
    project = await planningProject(root);
  if (input.doneBy === "you" && !input.steps?.length)
    throw new Error("Human tasks require at least one step");
  if (input.doneBy === "agent" && input.steps !== undefined)
    throw new Error("Checklist steps belong to human tasks");
  const id = createId(
      "act",
      new Set(
        [...project.records.values()].map((r) => String(r.document.data.id)),
      ),
    ),
    path = `.voidra/actions/${id}/action.md`;
  const data = schemas.action.parse({
    id,
    type: input.type,
    title: input.title,
    status: "ready",
    doneBy: input.doneBy,
    ...(input.assignee ? { assignee: input.assignee } : {}),
    ...(input.doneBy === "agent"
      ? { stage: lifecycles[input.type].stages[0] }
      : {
          steps: input.steps?.map((label, index) => ({
            id: `step-${index + 1}`,
            title: label,
            done: false,
          })),
        }),
    createdBy: input.by,
    createdAt: new Date().toISOString(),
  });
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(path, "---\n{}\n---\n"),
          data,
          input.description,
        ).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ],
  });
  return id;
}
export async function createIdea(
  root: string,
  raw: z.input<typeof ideaInput>,
): Promise<string> {
  const input = ideaInput.parse(raw),
    project = await planningProject(root),
    status = input.status ?? "new";
  rejection(status, input.reason);
  const id = createId(
      "idea",
      new Set(
        [...project.records.values()].map((r) => String(r.document.data.id)),
      ),
    ),
    path = `.voidra/backlog/${id}.md`;
  const data = schemas.idea.parse({
    id,
    title: input.title,
    status,
    ...(status === "rejected" ? { reason: input.reason?.trim() } : {}),
    createdBy: input.by,
    createdAt: new Date().toISOString(),
  });
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(path, "---\n{}\n---\n"),
          data,
          input.description,
        ).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ],
  });
  return id;
}
export async function editIdea(
  root: string,
  raw: z.input<typeof ideaEdit>,
): Promise<void> {
  const input = ideaEdit.parse(raw),
    project = await planningProject(root),
    path = `.voidra/backlog/${input.id}.md`,
    record = project.records.get(path);
  if (record?.kind !== "idea") throw new Error("Idea not found");
  if (hash(record.document.raw) !== input.revision)
    throw new Error(
      "Idea changed on disk; reload or explicitly overwrite the current revision",
    );
  const old = schemas.idea.parse(record.document.data);
  if ((old.status === "promoted") !== (input.status === "promoted"))
    throw new Error("Promotion must use the linked action workflow");
  rejection(input.status, input.reason);
  const data = { ...old, title: input.title, status: input.status };
  if (input.status === "rejected") data.reason = input.reason?.trim();
  else delete data.reason;
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: input.revision,
        content: serializeRecord(
          record.document,
          data,
          input.description,
        ).toString(),
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    ],
  });
}
