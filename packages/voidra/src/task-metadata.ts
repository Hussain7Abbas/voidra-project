import { z } from "zod";
import type { ProjectInspection } from "./project.ts";
import { readProjectRelease } from "./project-release.ts";
import { version } from "./schemas.ts";

export const taskInputFields = {
  targetRelease: version.nullable().optional(),
  taskColumn: z.enum(["backlog", "todo"]).optional(),
};
const inputSchema = z.strictObject(taskInputFields);

/** Creation defaults for opted-in projects; legacy projects retain their existing contract. */
export async function newTaskFields(
  root: string,
  project: ProjectInspection,
  kind: "action" | "idea",
  requested: z.input<typeof inputSchema> = {},
): Promise<z.infer<typeof inputSchema>> {
  const input = inputSchema.parse(requested);
  if (project.metadata?.taskTracking !== 1) {
    if (input.targetRelease !== undefined || input.taskColumn !== undefined)
      throw Error("Enable task tracking before using task release fields");
    return {};
  }
  const release =
    input.targetRelease === undefined
      ? (
          await readProjectRelease(
            root,
            project.metadata.releasePackage ?? "package.json",
          )
        ).version
      : input.targetRelease;
  if (kind === "idea") return { targetRelease: release };
  const column = input.taskColumn ?? (release ? "todo" : "backlog");
  if (column !== "backlog" && !release)
    throw Error(
      "Tasks outside Backlog require a release; choose a valid project package",
    );
  return { targetRelease: release, taskColumn: column };
}
