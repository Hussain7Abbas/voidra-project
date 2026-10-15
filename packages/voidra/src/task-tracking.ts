import { z } from "zod";
import { hash } from "./lifecycle.ts";
import { checkProject, type ProjectInspection } from "./project.ts";
import { type ProjectRelease, readProjectRelease } from "./project-release.ts";
import { serializeRecord } from "./records.ts";
import { hashSchema } from "./schemas.ts";
import { projectTasks } from "./task-view.ts";
import {
  applyOperation,
  type WriteManifest,
  type WriteOptions,
} from "./writer.ts";

export interface TaskTrackingPreview {
  enabled: boolean;
  revision: string;
  path: string;
  version: string;
  paths: string[];
  tasks: { id: string; title: string; targetRelease: string | null }[];
}
function migration(
  project: ProjectInspection,
  release: ProjectRelease,
): {
  preview: TaskTrackingPreview;
  changes: WriteManifest["changes"];
} {
  if (!project.metadata || project.diagnostics.length)
    throw Error(
      "Resolve planning-file problems before upgrading task tracking",
    );
  if (!release.version)
    throw Error(
      release.message ?? "Choose a valid package version before upgrading",
    );
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (r) => r.kind === "run" && r.document.data.outcome === "running",
    )
  )
    throw Error(
      "Finish or recover pending work before upgrading task tracking",
    );
  const metadata = project.records.get(".voidra/voidra.json")?.document;
  if (!metadata) throw Error("Project metadata missing");
  const changes: WriteManifest["changes"] = [];
  const tasks: TaskTrackingPreview["tasks"] = [];
  const enabled = project.metadata.taskTracking === 1;
  for (const task of projectTasks(project)) {
    const doc = project.records.get(task.path)?.document;
    if (!doc) throw Error("Task source missing");
    const active = !task.archived && task.column !== "done";
    const data =
      active && !enabled
        ? {
            ...doc.data,
            ...(task.kind === "action"
              ? { taskColumn: task.column === "backlog" ? "backlog" : "todo" }
              : {}),
            targetRelease:
              task.releaseAssigned && task.column === "backlog"
                ? task.targetRelease
                : (task.targetRelease ?? release.version),
          }
        : doc.data;
    const content = serializeRecord(doc, data).toString();
    changes.push({ path: task.path, expectedHash: task.revision, content });
    if (active && !enabled)
      tasks.push({
        id: task.id,
        title: task.title,
        targetRelease: data.targetRelease as string | null,
      });
  }
  // Guard promoted idea sources too, even though they do not produce a second card.
  for (const [path, record] of project.records) {
    if (record.kind === "idea" && !changes.some((c) => c.path === path))
      changes.push({
        path,
        expectedHash: hash(record.document.raw),
        content: record.document.raw.toString(),
      });
  }
  changes.push({
    path: metadata.file,
    expectedHash: hash(metadata.raw),
    content: enabled
      ? metadata.raw.toString()
      : serializeRecord(metadata, {
          ...metadata.data,
          taskTracking: 1,
          requiredVoidra: "1.1.0",
        }).toString(),
  });
  const paths = changes
    .filter((c) => c.content !== project.files.get(c.path)?.toString())
    .map((c) => c.path);
  const revision = hash(
    JSON.stringify({
      package: release,
      records: changes.map((c) => [c.path, c.expectedHash, c.content]),
    }),
  );
  return {
    preview: {
      enabled,
      revision,
      path: release.path,
      version: release.version,
      paths,
      tasks,
    },
    changes,
  };
}
/** Build a preview from an already inspected snapshot without another project scan. */
export function taskTrackingPreview(
  project: ProjectInspection,
  release: ProjectRelease,
): TaskTrackingPreview {
  return migration(project, release).preview;
}
export async function previewTaskTracking(
  root: string,
): Promise<TaskTrackingPreview> {
  const project = await checkProject(root);
  return taskTrackingPreview(
    project,
    await readProjectRelease(
      root,
      project.metadata?.releasePackage ?? "package.json",
    ),
  );
}
const enableInput = z.strictObject({ revision: hashSchema });
export async function enableTaskTracking(
  root: string,
  raw: z.input<typeof enableInput>,
  options: WriteOptions = {},
): Promise<void> {
  const input = enableInput.parse(raw),
    project = await checkProject(root);
  const release = await readProjectRelease(
    root,
    project.metadata?.releasePackage ?? "package.json",
  );
  const { preview, changes } = migration(project, release);
  if (input.revision !== preview.revision)
    throw Error("Task upgrade preview changed; refresh before applying");
  if (!preview.paths.length) return;
  await applyOperation(
    root,
    {
      changes: [
        ...changes,
        { path: ".voidra/local/run.lock", expectedHash: null, content: null },
        {
          path: ".voidra/local/planning.lock",
          expectedHash: null,
          content: null,
        },
      ],
    },
    {
      ...options,
      checkpoint: async (point, path) => {
        await options.checkpoint?.(point, path);
        if (point === "lock-acquired") {
          const current = await readProjectRelease(root, release.path);
          if (
            current.revision !== release.revision ||
            current.version !== release.version
          )
            throw Error("Package changed; refresh the task upgrade preview");
        }
      },
    },
  );
}
