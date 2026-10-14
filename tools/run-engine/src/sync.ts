import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  applySyncReport,
  checkProject,
  loadTemplate,
  type ProjectInspection,
  parseRecord,
  recoverOperation,
  type SyncResult,
  schemas,
  syncReportSchema,
  type WriteOptions,
} from "voidra";
import type { z } from "zod";
import { type GitCommit, readGitHistory, readGitIdentity } from "./git.ts";

declare const __voidraIntakeTemplates: string | undefined;
const execute = promisify(execFile);
async function git(root: string, args: string[]): Promise<string> {
  return (
    await execute("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout.trim();
}
export interface SyncContext {
  examinedRevision: string | null;
  since: string | null;
  commits: GitCommit[];
}
export async function syncContext(
  root: string,
  inspected?: ProjectInspection,
): Promise<SyncContext> {
  const top = await git(root, ["rev-parse", "--show-toplevel"]).catch(
    () => null,
  );
  if (!top || (await realpath(top)) !== (await realpath(root)))
    throw new Error("Run Sync from the project Git root");
  const head = await git(root, ["rev-parse", "--verify", "HEAD"]).catch(
    () => null,
  );
  if (!head) return { examinedRevision: null, since: null, commits: [] };
  const project = inspected ?? (await checkProject(root));
  const revisions = new Set(
    [...project.records.values()]
      .filter((r) => r.kind === "sync")
      .map((r) => String(r.document.data.examinedRevision)),
  );
  // Reachability/topology chooses the closest synced revision, including after branch switches.
  const reachable = (await git(root, ["rev-list", "--topo-order", head])).split(
    "\n",
  );
  const since = reachable.find((revision) => revisions.has(revision)) ?? null;
  const range = new Set(
    (
      await git(root, ["rev-list", ...(since ? [`${since}..${head}`] : [head])])
    ).split("\n"),
  );
  const history = await readGitHistory(root);
  if (history.notice) throw new Error(history.notice);
  if ((await git(root, ["rev-parse", "HEAD"])) !== head)
    throw new Error("Git revision changed during Sync inspection");
  return {
    examinedRevision: head,
    since,
    commits: history.commits.filter(
      (commit) => range.has(commit.hash) && !commit.actions.length,
    ),
  };
}

export const syncAgentReportSchema = syncReportSchema.omit({ by: true });
export async function applySync(
  root: string,
  raw: z.input<typeof syncAgentReportSchema>,
  options: WriteOptions = {},
): Promise<SyncResult> {
  const input = syncAgentReportSchema.parse(raw);
  let project = await checkProject(root);
  const contextBefore = await syncContext(root, project);
  if (contextBefore.examinedRevision !== input.examinedRevision)
    throw new Error("Git revision changed; inspect outside commits again");
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (r) => r.kind === "run" && r.document.data.outcome === "running",
    )
  )
    throw new Error("Finish or recover pending runs before Sync");
  const pending = [...project.records.values()].filter(
    (r) => r.kind === "operation" && r.document.data.state === "prepared",
  );
  for (const operation of pending) {
    const receipt = schemas.operation.parse(operation.document.data);
    const syncChange = receipt.changes.find((change) =>
      /^\.voidra\/syncs\/sync-[0-9a-hjkmnp-tv-z]{6}\.md$/.test(change.path),
    );
    if (!syncChange?.after)
      throw new Error("Recover unrelated pending work before Sync");
    const record = schemas.sync.parse(
      parseRecord(syncChange.path, syncChange.after).data,
    );
    if (
      syncChange.path !== `.voidra/syncs/${record.id}.md` ||
      receipt.changes.some(
        (change) =>
          !(
            /^\.voidra\/(?:syncs|profile|backlog|actions)\//.test(
              change.path,
            ) ||
            [
              ".voidra/voidra.json",
              ".voidra/local/sync-selection.json",
              ".voidra/local/run.lock",
              ".voidra/local/planning.lock",
            ].includes(change.path)
          ),
      )
    )
      throw new Error("Pending operation is not a contained Sync write");
    await git(root, [
      "merge-base",
      "--is-ancestor",
      record.examinedRevision,
      input.examinedRevision,
    ]).catch(() => {
      throw new Error(
        "Pending Sync belongs to another Git history; recover it explicitly",
      );
    });
    // The shared writer checks actual lock ownership and each partially applied file before resuming.
    await recoverOperation(root, receipt.id);
  }
  project = await checkProject(root);
  const existing = [...project.records.values()].find(
    (r) =>
      r.kind === "sync" &&
      r.document.data.examinedRevision === input.examinedRevision,
  );
  if (existing) {
    if (project.diagnostics.length)
      throw new Error("Fix planning problems before repeating Sync");
    const record = schemas.sync.parse(existing.document.data);
    return {
      id: record.id,
      path: existing.document.file,
      proposals: record.proposals,
      repeated: true,
    };
  }
  const context = await syncContext(root, project);
  if (
    context.examinedRevision !== input.examinedRevision ||
    context.since !== input.since ||
    JSON.stringify(context.commits.map((commit) => commit.hash)) !==
      JSON.stringify(input.commits)
  )
    throw new Error("Examined commits changed; refresh the Sync context");
  const identity = await readGitIdentity(root);
  if (!identity.value)
    throw new Error("Configure Git name and email before Sync");
  let template = null;
  if (input.profiles.length) {
    const selected = project.metadata?.template;
    if (!selected)
      throw new Error("Profile inference requires the project's template");
    const directory =
      typeof __voidraIntakeTemplates !== "undefined"
        ? __voidraIntakeTemplates
        : fileURLToPath(
            new URL(
              "../../../skills/voidra-init/references/templates/",
              import.meta.url,
            ),
          );
    template = await loadTemplate(
      join(directory, selected.id, "template.yaml"),
    );
  }
  return applySyncReport(
    root,
    template,
    { ...input, by: identity.value },
    {
      ...options,
      async checkpoint(point, path) {
        if (
          point === "preflight" &&
          (await git(root, ["rev-parse", "HEAD"])) !== input.examinedRevision
        )
          throw new Error("Git revision changed before Sync writes");
        await options.checkpoint?.(point, path);
      },
    },
  );
}

export async function runSync(
  args: string[],
  cwd: string,
): Promise<{ code: number; value: unknown }> {
  try {
    if (args.includes("--help"))
      return {
        code: 0,
        value: {
          help: "voidra-sync context [--project FOLDER]; apply --report FILE [--project FOLDER]. Reads real outside commits; writes inferred profile/proposals and a recoverable sync record only. Never commits, tags or changes code.",
        },
      };
    const command = args[0];
    if (!["context", "apply"].includes(command ?? ""))
      throw new Error("Choose Sync context or apply");
    const flags = new Map<string, string>();
    for (let index = 1; index < args.length; index += 2) {
      const key = args[index],
        value = args[index + 1];
      if (
        !key ||
        !value ||
        !["--project", "--report"].includes(key) ||
        flags.has(key)
      )
        throw new Error("Invalid Sync option");
      flags.set(key, value);
    }
    const root = resolve(cwd, flags.get("--project") ?? ".");
    if (command === "context") {
      if (flags.has("--report")) throw new Error("Context has no report input");
      return { code: 0, value: await syncContext(root) };
    }
    const report = flags.get("--report");
    if (!report) throw new Error("Sync apply requires --report FILE");
    return {
      code: 0,
      value: await applySync(
        root,
        JSON.parse(await readFile(resolve(root, report), "utf8")),
      ),
    };
  } catch (error) {
    return {
      code: 1,
      value: { error: error instanceof Error ? error.message : "Sync failed" },
    };
  }
}
