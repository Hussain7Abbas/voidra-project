import { z } from "zod";
import type { ProjectInspection } from "./project.ts";
import { readProjectRelease } from "./project-release.ts";
import { version } from "./schemas.ts";

export const taskInputFields = {
  targetRelease: version.nullable().optional(),
  taskColumn: z
    .enum(["backlog", "planning", "todo", "in-progress", "review"])
    .optional(),
  taskWorkflow: z.literal(1).optional(),
};
const inputSchema = z.strictObject(taskInputFields);

/** Creation defaults for opted-in projects; legacy projects retain their existing contract. */
export async function newTaskFields(
  root: string,
  project: ProjectInspection,
  kind: "action" | "idea",
  requested: z.input<typeof inputSchema> = {},
  inheritWorkflow = true,
): Promise<z.infer<typeof inputSchema>> {
  const input = inputSchema.parse(requested);
  if (
    inheritWorkflow &&
    input.taskWorkflow === undefined &&
    project.metadata?.taskWorkflow === 1
  )
    input.taskWorkflow = 1;
  if (project.metadata?.taskTracking !== 1) {
    if (
      input.targetRelease !== undefined ||
      input.taskColumn !== undefined ||
      input.taskWorkflow !== undefined
    )
      throw Error("Enable task tracking before using task release fields");
    return {};
  }
  const release =
    input.targetRelease === undefined
      ? (await readProjectRelease(root)).version
      : input.targetRelease;
  if (kind === "idea") return { targetRelease: release };
  const column =
    input.taskColumn ??
    (input.taskWorkflow === 1
      ? release
        ? "planning"
        : "backlog"
      : release
        ? "todo"
        : "backlog");
  if (column !== "backlog" && !release)
    throw Error(
      "Tasks outside Backlog require a release; choose a valid project package",
    );
  return {
    targetRelease: release,
    taskColumn: column,
    ...(input.taskWorkflow === 1 ? { taskWorkflow: 1 as const } : {}),
  };
}
