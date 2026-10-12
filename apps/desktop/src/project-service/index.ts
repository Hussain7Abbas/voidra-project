import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { projectSchema } from "../shared/bridge.ts";

const request = z.strictObject({
  id: z.string(),
  command: z.enum(["status", "shutdown"]),
});
const [root, databasePath] = process.argv.slice(2);
if (!root || !databasePath || !process.parentPort)
  throw new Error("Project service needs its parent and validated paths");
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
    process.exit(0);
    return;
  }
  try {
    if (!(await stat(root)).isDirectory())
      throw new Error("Project folder is missing");
    let hasVoidra = false;
    try {
      hasVoidra = (await stat(join(root, ".voidra"))).isDirectory();
    } catch {}
    const project = projectSchema.parse({
      path: root,
      name: basename(root),
      hasVoidra,
      sqliteVersion,
    });
    parent.postMessage({ id: parsed.data.id, ok: true, project });
  } catch (error) {
    parent.postMessage({
      id: parsed.data.id,
      ok: false,
      message: (error as Error).message,
    });
  }
});
process.on("exit", () => database.close());

process.on("SIGTERM", () => process.exit(0));
