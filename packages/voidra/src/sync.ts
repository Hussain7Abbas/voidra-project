import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { createId } from "./ids.ts";
import { hash, projectLifecycles } from "./lifecycle.ts";
import {
  blockingPlanningDiagnostics,
  checkProject,
  PACKAGE_VERSION,
} from "./project.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { hashSchema, schemas } from "./schemas.ts";
import { newTaskFields } from "./task-metadata.ts";
import {
  type Template,
  validateTemplate,
  validateTemplateAnswer,
} from "./templates.ts";
import {
  applyOperation,
  type WriteManifest,
  type WriteOptions,
} from "./writer.ts";

const text = z.string().trim().min(1),
  commit = schemas.sync.shape.examinedRevision;
const proposal = { title: text, body: text, commits: z.array(commit).min(1) };
export const syncReportSchema = z.strictObject({
  examinedRevision: commit,
  since: commit.nullable(),
  commits: z.array(commit).min(1),
  by: text,
  summary: text,
  profiles: z
    .array(
      z.strictObject({
        block: schemas.profile.shape.block,
        id: text,
        value: z
          .json()
          .refine((value) => value !== null, "Sync needs an observed value"),
        revision: hashSchema,
        commit,
        source: text,
      }),
    )
    .max(100),
  ideas: z.array(z.strictObject(proposal)).max(100),
  actions: z
    .array(
      z.strictObject({
        ...proposal,
        type: z.enum(["feature", "bug", "improvement", "docs", "research"]),
      }),
    )
    .max(100),
});
export type SyncReport = z.infer<typeof syncReportSchema>;
export interface SyncResult {
  id: string;
  path: string;
  proposals: string[];
  repeated: boolean;
}

/** Git evidence is verified by the standalone adapter; this boundary owns planning writes only. */
export async function applySyncReport(
  root: string,
  rawTemplate: Template | null,
  raw: SyncReport,
  options: WriteOptions = {},
): Promise<SyncResult> {
  const input = syncReportSchema.parse(raw),
    project = await checkProject(root);
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (r) =>
        (r.kind === "run" && r.document.data.outcome === "running") ||
        (r.kind === "operation" && r.document.data.state === "prepared"),
    )
  )
    throw new Error("Finish or recover pending work before Sync");
  if (!project.metadata || blockingPlanningDiagnostics(project).length)
    throw new Error("Fix planning-file problems before Sync");
  const existing = [...project.records.values()].find(
    (r) =>
      r.kind === "sync" &&
      r.document.data.examinedRevision === input.examinedRevision,
  );
  if (existing) {
    const record = schemas.sync.parse(existing.document.data);
    return {
      id: record.id,
      path: existing.document.file,
      proposals: record.proposals,
      repeated: true,
    };
  }
  if (new Set(input.commits).size !== input.commits.length)
    throw new Error("Duplicate examined commits");
  const evidence = new Set(input.commits),
    ids = new Set(
      [...project.records.values()].map((r) => String(r.document.data.id)),
    );
  const fresh = (prefix: "act" | "idea" | "sync") => {
    const id = createId(prefix, ids);
    ids.add(id);
    return id;
  };
  const id = fresh("sync"),
    path = `.voidra/syncs/${id}.md`,
    at = new Date().toISOString(),
    proposals: string[] = [];
  const changes: WriteManifest["changes"] = [];
  const consumedRecords = [...project.records.values()]
    .filter((record) =>
      ["project", "profile", "idea", "action"].includes(record.kind),
    )
    .map((record) => record.document.file);
  function newRecord(
    path: string,
    data: Record<string, unknown>,
    body: string,
  ) {
    changes.push({
      path,
      expectedHash: null,
      content: serializeRecord(
        parseRecord(path, "---\n{}\n---\n"),
        data,
        body,
      ).toString(),
    });
  }
  function sources(commits: string[]): string[] {
    if (commits.some((commit) => !evidence.has(commit)))
      throw new Error("Proposal references an unexamined commit");
    return commits.map((commit) => `commit:${commit}`);
  }
  const template = rawTemplate ? validateTemplate(rawTemplate) : null;
  if (
    input.profiles.length &&
    (!template ||
      template.id !== project.metadata.template?.id ||
      template.version !== project.metadata.template.version)
  )
    throw new Error(
      "Load the project's matching template before inferring profile answers",
    );
  const updates = new Map<string, typeof input.profiles>();
  const answers = new Set<string>();
  for (const update of input.profiles) {
    const key = `${update.block}.${update.id}`;
    if (answers.has(key)) throw new Error("Duplicate profile update");
    answers.add(key);
    sources([update.commit]);
    const path = `.voidra/profile/${update.block}.md`;
    updates.set(path, [...(updates.get(path) ?? []), update]);
  }
  for (const [path, updatesForBlock] of updates) {
    const doc = project.records.get(path)?.document;
    if (!doc) throw new Error("Profile block missing");
    const profile = schemas.profile.parse(doc.data);
    for (const update of updatesForBlock) {
      if (hash(doc.raw) !== update.revision)
        throw new Error("Profile changed; refresh Sync evidence");
      const question = template?.blocks
        .find((b) => b.id === update.block)
        ?.questions.find((q) => q.id === update.id);
      const answer = profile.answers.find((a) => a.id === update.id);
      if (!question || !answer)
        throw new Error("Profile question missing from template or record");
      const value = validateTemplateAnswer(question, update.value);
      if (answer.status === "confirmed") {
        if (!isDeepStrictEqual(answer.answer, value)) {
          const proposed = fresh("act");
          proposals.push(proposed);
          newRecord(
            `.voidra/actions/${proposed}/action.md`,
            {
              id: proposed,
              type: "profile-change",
              ...(await newTaskFields(
                root,
                project,
                "action",
                project.metadata?.taskTracking === 1
                  ? { taskColumn: "backlog" }
                  : {},
              )),
              title: `Review ${profile.title}: ${answer.question}`,
              stage: projectLifecycles(project.metadata)["profile-change"]
                .stages[0],
              status: "draft",
              doneBy: "agent",
              createdBy: input.by,
              createdAt: at,
              links: [path + `#${update.id}`, ...sources([update.commit])],
              profileChange: {
                block: update.block,
                answerId: update.id,
                before: answer.answer,
                after: value,
              },
            },
            `Outside work suggests a changed answer. The confirmed profile remains unchanged. Review this draft before queueing it.\n\n${update.source}\n`,
          );
        }
      } else {
        answer.answer = value;
        answer.status = "inferred";
        answer.source = `commit:${update.commit} — ${update.source}`;
        answer.updatedAt = at;
        delete answer.confirmedBy;
      }
    }
    changes.push({
      path,
      expectedHash: hash(doc.raw),
      content: serializeRecord(doc, profile).toString(),
    });
  }
  for (const idea of input.ideas) {
    const proposed = fresh("idea");
    proposals.push(proposed);
    newRecord(
      `.voidra/backlog/${proposed}.md`,
      {
        id: proposed,
        title: idea.title,
        ...(await newTaskFields(root, project, "idea")),
        status: "new",
        createdBy: input.by,
        createdAt: at,
        links: sources(idea.commits),
      },
      `${idea.body}\n`,
    );
  }
  for (const action of input.actions) {
    const proposed = fresh("act");
    proposals.push(proposed);
    newRecord(
      `.voidra/actions/${proposed}/action.md`,
      {
        id: proposed,
        title: action.title,
        ...(await newTaskFields(root, project, "action")),
        type: action.type,
        stage: projectLifecycles(project.metadata)[action.type].stages[0],
        status: "ready",
        doneBy: "agent",
        createdBy: input.by,
        createdAt: at,
        links: sources(action.commits),
      },
      `${action.body}\n`,
    );
  }
  newRecord(
    path,
    {
      id,
      examinedRevision: input.examinedRevision,
      since: input.since,
      commits: input.commits,
      proposals,
      consumedRecords,
      by: input.by,
      at,
    },
    `${input.summary}\n`,
  );
  const metadata = project.records.get(".voidra/voidra.json")?.document;
  if (!metadata) throw new Error("Project metadata missing");
  const tokenPath = ".voidra/local/sync-selection.json",
    token = project.files.get(tokenPath);
  changes.push(
    {
      path: metadata.file,
      expectedHash: hash(metadata.raw),
      content: serializeRecord(metadata, {
        ...metadata.data,
        requiredVoidra: PACKAGE_VERSION,
      }).toString(),
    },
    {
      path: tokenPath,
      expectedHash: token ? hash(token) : null,
      content: `${JSON.stringify({ sync: id })}\n`,
    },
    { path: ".voidra/local/run.lock", expectedHash: null, content: null },
    { path: ".voidra/local/planning.lock", expectedHash: null, content: null },
  );
  const touched = new Set(changes.map((change) => change.path));
  for (const path of consumedRecords) {
    if (touched.has(path)) continue;
    const bytes = project.files.get(path);
    if (bytes)
      changes.push({
        path,
        expectedHash: hash(bytes),
        content: bytes.toString(),
      });
  }
  await applyOperation(root, { changes }, options);
  return { id, path, proposals, repeated: false };
}
