import { z } from "zod";
import { actionComplete, hash } from "./lifecycle.ts";
import {
  checkProject,
  inspectFiles,
  type ProjectInspection,
} from "./project.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { hashSchema, schemas } from "./schemas.ts";
import {
  ACTION_QUEUE_PATH,
  ACTION_SEQUENCE_PATH,
  actionSequenceSchema,
} from "./sequence-state.ts";
import { projectTasks, type TaskView } from "./task-view.ts";
import {
  applyOperation,
  type WriteManifest,
  type WriteOptions,
} from "./writer.ts";

export { ACTION_QUEUE_PATH, ACTION_SEQUENCE_PATH, actionSequenceSchema };
export interface SequenceNode {
  id: string;
  complete: boolean;
  dependencies: readonly string[];
}
export interface SequenceWarning {
  task: string;
  dependency: string;
  kind: "later" | "absent" | "missing";
  path: string[];
}

function dependenciesOf(
  id: string,
  nodes: ReadonlyMap<string, SequenceNode>,
): { id: string; path: string[] }[] {
  const result: { id: string; path: string[] }[] = [],
    seen = new Set<string>();
  const visit = (current: string, path: string[]) => {
    if (seen.has(current)) return;
    seen.add(current);
    for (const dependency of nodes.get(current)?.dependencies ?? []) {
      const node = nodes.get(dependency);
      if (node?.complete) continue;
      const next = [...path, dependency];
      result.push({ id: dependency, path: next });
      visit(dependency, next);
    }
  };
  visit(id, [id]);
  return result;
}

/** Warning only; this function never changes execution eligibility or adds an entry. */
export function sequenceWarnings(
  ids: readonly string[],
  graph: readonly SequenceNode[],
): SequenceWarning[] {
  const positions = new Map(ids.map((id, index) => [id, index]));
  const nodes = new Map(graph.map((node) => [node.id, node]));
  const warnings: SequenceWarning[] = [];
  for (const [taskIndex, task] of ids.entries()) {
    if (!nodes.has(task)) {
      warnings.push({ task, dependency: task, kind: "missing", path: [task] });
      continue;
    }
    const emitted = new Set<string>();
    for (const dependency of dependenciesOf(task, nodes)) {
      if (emitted.has(dependency.id)) continue;
      emitted.add(dependency.id);
      const position = positions.get(dependency.id);
      const kind = !nodes.has(dependency.id)
        ? "missing"
        : position === undefined
          ? "absent"
          : position > taskIndex
            ? "later"
            : null;
      if (kind)
        warnings.push({
          task,
          dependency: dependency.id,
          kind,
          path: dependency.path,
        });
    }
  }
  return warnings;
}

/** Stable Kahn ordering: the earliest currently eligible original entry wins each tie. */
export function rearrangeSequence(
  ids: readonly string[],
  graph: readonly SequenceNode[],
): string[] {
  if (new Set(ids).size !== ids.length) throw Error("Duplicate sequence entry");
  const included = new Set(ids),
    nodes = new Map(graph.map((node) => [node.id, node]));
  if (ids.some((id) => !nodes.has(id)))
    throw Error("Repair missing task sources before rearranging");
  const needed = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const id of ids) {
    const prerequisites = new Set(
      dependenciesOf(id, nodes)
        .map((node) => node.id)
        .filter((dependency) => included.has(dependency)),
    );
    needed.set(id, prerequisites);
    for (const dependency of prerequisites) {
      const users = dependents.get(dependency) ?? new Set<string>();
      users.add(id);
      dependents.set(dependency, users);
    }
  }
  const positions = new Map(ids.map((id, index) => [id, index]));
  const ready = ids.filter((id) => !needed.get(id)?.size),
    output: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => (positions.get(a) ?? 0) - (positions.get(b) ?? 0));
    const next = ready.shift();
    if (!next) break;
    output.push(next);
    for (const user of dependents.get(next) ?? []) {
      const prerequisites = needed.get(user);
      prerequisites?.delete(next);
      if (!prerequisites?.size) ready.push(user);
    }
  }
  if (output.length !== ids.length)
    throw Error("Dependency cycle prevents rearranging this sequence");
  return output;
}

function nodes(project: ProjectInspection): SequenceNode[] {
  const actions = [...project.records.values()]
    .filter((record) => record.kind === "action")
    .map((record) => schemas.action.parse(record.document.data));
  const children = new Map<string, string[]>();
  for (const action of actions)
    if (action.parent)
      children.set(action.parent, [
        ...(children.get(action.parent) ?? []),
        action.id,
      ]);
  return actions.map((action) => ({
    id: action.id,
    complete: actionComplete(action),
    dependencies: [
      ...new Set([
        ...(action.blockedBy ?? []),
        ...(children.get(action.id) ?? []),
      ]),
    ],
  }));
}
function queueIds(project: ProjectInspection): string[] {
  return [
    ...(project.records
      .get(ACTION_QUEUE_PATH)
      ?.document.body.matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g) ?? []),
  ].map((match) => match[0]);
}
const active = (task: TaskView) =>
  task.kind === "action" &&
  !task.archived &&
  !["backlog", "done"].includes(task.column);
function state(project: ProjectInspection) {
  const bytes = project.files.get(ACTION_SEQUENCE_PATH);
  if (!bytes) return null;
  return actionSequenceSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
export interface ActionSequenceView {
  enabled: boolean;
  revision: string | null;
  order: string[];
  pending: string[];
  warnings: SequenceWarning[];
  problems: string[];
  rearranged: string[] | null;
}
export function readActionSequence(
  project: ProjectInspection,
): ActionSequenceView {
  let saved: ReturnType<typeof state>;
  try {
    saved = state(project);
  } catch {
    const order = projectTasks(project)
      .filter(active)
      .map((task) => task.id);
    return {
      enabled: false,
      revision: project.files.has(ACTION_SEQUENCE_PATH)
        ? hash(project.files.get(ACTION_SEQUENCE_PATH) as Buffer)
        : null,
      order,
      pending: queueIds(project),
      warnings: sequenceWarnings(order, nodes(project)),
      problems: [
        "Invalid Actions sequence; preserve it and recover explicitly",
      ],
      rearranged: null,
    };
  }
  const tasks = projectTasks(project),
    byId = new Map(tasks.map((task) => [task.id, task]));
  const pending = queueIds(project),
    source = saved?.order ?? pending;
  const order = [
    ...new Set([
      ...source.filter(
        (id) => !byId.has(id) || active(byId.get(id) as TaskView),
      ),
      ...tasks.filter(active).map((task) => task.id),
    ]),
  ];
  const graph = nodes(project),
    warnings = sequenceWarnings(order, graph);
  const privateProblems = project.diagnostics
    .filter((item) =>
      [ACTION_SEQUENCE_PATH, ACTION_QUEUE_PATH].includes(item.file),
    )
    .map((item) => item.message);
  let rearranged: string[] | null = null;
  if (
    warnings.some((item) => item.kind === "later") &&
    !privateProblems.length
  ) {
    try {
      rearranged = rearrangeSequence(order, graph);
    } catch {
      rearranged = null;
    }
  }
  return {
    enabled:
      project.metadata?.taskTracking === 1 &&
      !privateProblems.length &&
      !!saved &&
      project.records.get(ACTION_QUEUE_PATH)?.document.data.orderedIntent === 1,
    revision: project.files.has(ACTION_SEQUENCE_PATH)
      ? hash(project.files.get(ACTION_SEQUENCE_PATH) as Buffer)
      : null,
    order,
    pending,
    warnings,
    rearranged,
    problems: [
      ...privateProblems,
      ...order
        .filter((id) => !byId.has(id))
        .map((id) => `Restore or repair the missing task source for ${id}`),
    ],
  };
}
function guard(project: ProjectInspection): void {
  if (project.metadata?.taskTracking !== 1)
    throw Error(
      "Enable release-aware task tracking before the Actions sequence",
    );
  if (project.diagnostics.length)
    throw Error(
      "Resolve planning-file problems before editing the Actions sequence",
    );
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (record) =>
        (record.kind === "run" && record.document.data.outcome === "running") ||
        (record.kind === "operation" &&
          record.document.data.state === "prepared"),
    )
  )
    throw Error(
      "Finish or recover pending work before editing the Actions sequence",
    );
}
function conversion(project: ProjectInspection) {
  guard(project);
  const view = readActionSequence(project),
    ran = new Set(
      [...project.records.values()]
        .filter((record) => record.kind === "run")
        .map((record) => String(record.document.data.action)),
    );
  if (view.problems.length) throw Error(view.problems.join(" · "));
  const fresh = projectTasks(project)
    .filter(
      (task) =>
        task.kind === "action" &&
        task.column === "todo" &&
        task.status === "ready" &&
        !ran.has(task.id) &&
        project.records.get(task.path)?.document.data.doneBy === "agent",
    )
    .map((task) => task.id);
  const pending = view.enabled
    ? view.pending
    : [...new Set([...view.pending, ...fresh])];
  const sources = [...project.files]
    .filter(
      ([path]) =>
        !path.startsWith(".voidra/local/") ||
        [ACTION_SEQUENCE_PATH, ACTION_QUEUE_PATH].includes(path),
    )
    .map(([path, bytes]) => [path, hash(bytes)])
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
  return {
    enabled: view.enabled,
    revision: hash(
      JSON.stringify({ version: 1, sources, order: view.order, pending }),
    ),
    order: view.order,
    pending,
  };
}
export interface ActionSequencePreview {
  enabled: boolean;
  revision: string;
  order: string[];
  pending: string[];
}
export function actionSequencePreview(
  project: ProjectInspection,
): ActionSequencePreview {
  return conversion(project);
}
export async function previewActionSequence(
  root: string,
): Promise<ActionSequencePreview> {
  return conversion(await checkProject(root));
}
/** Deterministic bootstrap for the existing exact task-upgrade preview; no invented time/actor. */
export function initializeActionSequenceChanges(
  project: ProjectInspection,
): WriteManifest["changes"] {
  const preview = conversion(project);
  if (preview.enabled) return [];
  const doc =
    project.records.get(ACTION_QUEUE_PATH)?.document ??
    parseRecord(ACTION_QUEUE_PATH, "---\n{}\n---\n");
  return [
    {
      path: ACTION_SEQUENCE_PATH,
      expectedHash: project.files.has(ACTION_SEQUENCE_PATH)
        ? hash(project.files.get(ACTION_SEQUENCE_PATH) as Buffer)
        : null,
      content: `${JSON.stringify({ version: 1, order: preview.order }, null, 2)}\n`,
    },
    {
      path: ACTION_QUEUE_PATH,
      expectedHash: project.files.has(ACTION_QUEUE_PATH)
        ? hash(project.files.get(ACTION_QUEUE_PATH) as Buffer)
        : null,
      content: serializeRecord(
        doc,
        { ...doc.data, orderedIntent: 1 },
        preview.pending
          .map((id, index) => `${index + 1}. [ ] ${id}`)
          .join("\n"),
      ).toString(),
    },
  ];
}
function queueContent(
  project: ProjectInspection,
  ids: string[],
  by: string,
): string {
  const doc =
    project.records.get(ACTION_QUEUE_PATH)?.document ??
    parseRecord(ACTION_QUEUE_PATH, "---\n{}\n---\n");
  return serializeRecord(
    doc,
    {
      ...doc.data,
      orderedIntent: 1,
      queuedBy: by,
      queuedAt: new Date().toISOString(),
    },
    ids.map((id, index) => `${index + 1}. [ ] ${id}`).join("\n"),
  ).toString();
}
function sourceGuards(project: ProjectInspection): WriteManifest["changes"] {
  return [...project.files]
    .filter(([path]) => !path.startsWith(".voidra/local/"))
    .map(([path, bytes]) => ({
      path,
      expectedHash: hash(bytes),
      content: bytes.toString(),
    }));
}
const enableInput = z.strictObject({
  revision: hashSchema,
  by: z.string().min(1),
});
export async function enableActionSequence(
  root: string,
  raw: z.input<typeof enableInput>,
  options: WriteOptions = {},
): Promise<void> {
  const input = enableInput.parse(raw),
    project = await checkProject(root),
    preview = conversion(project);
  if (input.revision !== preview.revision)
    throw Error("Actions sequence preview changed; refresh before applying");
  if (preview.enabled) return;
  const old = state(project);
  await applyOperation(
    root,
    {
      changes: [
        ...sourceGuards(project),
        {
          path: ACTION_SEQUENCE_PATH,
          expectedHash: project.files.has(ACTION_SEQUENCE_PATH)
            ? hash(project.files.get(ACTION_SEQUENCE_PATH) as Buffer)
            : null,
          content: `${JSON.stringify({ ...old, version: 1, order: preview.order }, null, 2)}\n`,
        },
        {
          path: ACTION_QUEUE_PATH,
          expectedHash: project.files.has(ACTION_QUEUE_PATH)
            ? hash(project.files.get(ACTION_QUEUE_PATH) as Buffer)
            : null,
          content: queueContent(project, preview.pending, input.by),
        },
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
        {
          path: ".voidra/local/planning.lock",
          expectedHash: null,
          content: null,
        },
      ],
    },
    options,
  );
}
/** Enroll newly entered TODO work atomically; never replenish a consumed run token. */
export function withActionSequence(
  project: ProjectInspection,
  manifest: WriteManifest,
  by = "You",
): WriteManifest {
  const sequence = readActionSequence(project);
  if (!sequence.enabled) return manifest;
  const files = new Map(project.files),
    changes = new Map(manifest.changes.map((change) => [change.path, change]));
  for (const change of manifest.changes) {
    if (change.content === null) files.delete(change.path);
    else files.set(change.path, Buffer.from(change.content));
  }
  const after = inspectFiles(files),
    tasks = projectTasks(after),
    byId = new Map(tasks.map((task) => [task.id, task]));
  const beforeActive = new Set(
    projectTasks(project)
      .filter(active)
      .map((task) => task.id),
  );
  const order = [
    ...new Set([
      ...sequence.order.filter(
        (id) => !byId.has(id) || active(byId.get(id) as TaskView),
      ),
      ...tasks.filter(active).map((task) => task.id),
    ]),
  ];
  const pending = queueIds(after).filter(
    (id) => !byId.has(id) || active(byId.get(id) as TaskView),
  );
  for (const task of tasks)
    if (
      active(task) &&
      task.column === "todo" &&
      task.status === "ready" &&
      !beforeActive.has(task.id) &&
      after.records.get(task.path)?.document.data.doneBy === "agent" &&
      !pending.includes(task.id)
    )
      pending.push(task.id);
  const positions = new Map(order.map((id, index) => [id, index]));
  pending.sort(
    (a, b) => (positions.get(a) ?? Infinity) - (positions.get(b) ?? Infinity),
  );
  const replace = (path: string, content: string) => {
    const bytes = project.files.get(path);
    if (content === bytes?.toString() && !changes.has(path)) return;
    changes.set(path, {
      path,
      expectedHash: changes.has(path)
        ? (changes.get(path)?.expectedHash ?? null)
        : bytes
          ? hash(bytes)
          : null,
      content,
    });
  };
  const saved = state(project);
  if (JSON.stringify(saved?.order) !== JSON.stringify(order))
    replace(
      ACTION_SEQUENCE_PATH,
      `${JSON.stringify({ ...saved, version: 1, order }, null, 2)}\n`,
    );
  if (JSON.stringify(queueIds(after)) !== JSON.stringify(pending))
    replace(ACTION_QUEUE_PATH, queueContent(after, pending, by));
  if (changes.has(ACTION_SEQUENCE_PATH) || changes.has(ACTION_QUEUE_PATH)) {
    for (const path of [
      ".voidra/local/run.lock",
      ".voidra/local/planning.lock",
    ])
      if (!changes.has(path))
        changes.set(path, { path, expectedHash: null, content: null });
  }
  return { ...manifest, changes: [...changes.values()] };
}

const replaceInput = z.strictObject({
  order: actionSequenceSchema.shape.order,
  revision: hashSchema,
  queueRevision: hashSchema.nullable(),
  revisions: z.record(schemas.action.shape.id, hashSchema),
  by: z.string().min(1),
});
/** Reorder all intent, retaining exactly the existing runnable-request tokens. */
export async function replaceActionSequence(
  root: string,
  raw: z.input<typeof replaceInput>,
  options: WriteOptions = {},
): Promise<void> {
  const input = replaceInput.parse(raw),
    project = await checkProject(root);
  guard(project);
  const current = readActionSequence(project),
    queueBytes = project.files.get(ACTION_QUEUE_PATH);
  if (!current.enabled)
    throw Error("Preview and enable the Actions sequence first");
  if (
    current.revision !== input.revision ||
    (queueBytes ? hash(queueBytes) : null) !== input.queueRevision
  )
    throw Error("Actions sequence changed; refresh before reordering");
  if (current.problems.length) throw Error(current.problems.join(" · "));
  if (
    input.order.length !== current.order.length ||
    input.order.some((id) => !current.order.includes(id))
  )
    throw Error("Reorder the complete Actions sequence; preserve hidden tasks");
  for (const id of input.order) {
    const bytes = project.files.get(`.voidra/actions/${id}/action.md`);
    if (!bytes || input.revisions[id] !== hash(bytes))
      throw Error("A task changed; refresh before reordering");
  }
  const position = new Map(input.order.map((id, index) => [id, index]));
  const pending = [...current.pending].sort(
    (a, b) => (position.get(a) ?? Infinity) - (position.get(b) ?? Infinity),
  );
  const saved = state(project);
  if (
    JSON.stringify(saved?.order) === JSON.stringify(input.order) &&
    JSON.stringify(pending) === JSON.stringify(current.pending)
  )
    return;
  await applyOperation(
    root,
    {
      changes: [
        ...sourceGuards(project),
        {
          path: ACTION_SEQUENCE_PATH,
          expectedHash: input.revision,
          content: `${JSON.stringify({ ...saved, version: 1, order: input.order }, null, 2)}\n`,
        },
        {
          path: ACTION_QUEUE_PATH,
          expectedHash: input.queueRevision,
          content: queueContent(project, pending, input.by),
        },
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
        {
          path: ".voidra/local/planning.lock",
          expectedHash: null,
          content: null,
        },
      ],
    },
    options,
  );
}
