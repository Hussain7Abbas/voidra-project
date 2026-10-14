import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  isKnowledgeRequest,
  knowledgeRequestSchema,
  projectSchema,
  workspaceEdits,
  workspaceRequestSchema,
} from "../shared/bridge.ts";
import { ProjectWorkspace } from "./workspace.ts";

const request = z.discriminatedUnion("command", [
  z.strictObject({ requestId: z.string(), command: z.literal("status") }),
  z.strictObject({ requestId: z.string(), command: z.literal("shutdown") }),
  ...knowledgeRequestSchema.options.map((schema) =>
    schema.extend({ requestId: z.string() }),
  ),

  ...workspaceRequestSchema.options.map((schema) =>
    schema.extend({ requestId: z.string() }),
  ),
]);
const [root, databasePath] = process.argv.slice(2);
if (!root || !databasePath || !process.parentPort)
  throw new Error("Project service needs its parent and validated paths");
const workspace = new ProjectWorkspace(root, databasePath, () =>
  process.parentPort?.postMessage({ event: "changed" }),
);
const ready = workspace.start();
const database = new Database(databasePath);
const sqliteVersion = String(
  (
    database.prepare("select sqlite_version() as version").get() as {
      version: string;
    }
  ).version,
);
const parent = process.parentPort;
parent.on("message", async (event: { data: unknown }) => {
  const parsed = request.safeParse(event.data);
  if (!parsed.success) return;
  if (parsed.data.command === "shutdown") {
    await workspace.close();
    database.close();
    process.exit(0);
    return;
  }
  try {
    await ready;
    if (!(await stat(root)).isDirectory())
      throw new Error("Project folder is missing");
    let hasVoidra = false;
    try {
      hasVoidra = (await stat(join(root, ".voidra"))).isDirectory();
    } catch {}
    if (parsed.data.command !== "status") {
      const { requestId, ...input } = parsed.data;
      if (isKnowledgeRequest(input)) {
        parent.postMessage({
          requestId,
          ok: true,
          data: await workspace.query(input),
        });
        return;
      }
      parent.postMessage({
        requestId,
        ok: true,
        workspace: await workspace.handle(workspaceRequestSchema.parse(input)),
      });
      return;
    }
    const project = projectSchema.parse({
      path: root,
      name: basename(root),
      hasVoidra,
      sqliteVersion,
    });
    parent.postMessage({ requestId: parsed.data.requestId, ok: true, project });
  } catch (error) {
    parent.postMessage({
      requestId: parsed.data.requestId,
      ok: false,
      message: (error as Error).message,
    });
    // A rejected edit may have observed newer files than the renderer.
    if (
      parsed.data.command !== "workspace" &&
      Object.hasOwn(workspaceEdits, parsed.data.command)
    )
      parent.postMessage({ event: "changed" });
  }
});

process.on("SIGTERM", () => {
  void workspace.close().finally(() => {
    database.close();
    process.exit(0);
  });
});
