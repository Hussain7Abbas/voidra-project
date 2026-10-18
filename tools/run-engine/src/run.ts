import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import {
  ACTION_SEQUENCE_PATH,
  type Action,
  applyOperation,
  checkProject,
  checkReleasePreparation,
  createId,
  hash,
  newTaskFields,
  parseRecord,
  projectLifecycles,
  qualityReportSchema,
  queueDecision,
  readActionSequence,
  readPlan,
  readProjectRelease,
  recoverOperation,
  releaseCandidates,
  releasedMember,
  releasePreparationSchema,
  reviewRevision,
  schemas,
  serializeRecord,
  taskRunKind,
  transition,
  withActionSequence,
} from "voidra";
import { z } from "zod";
import {
  architectureProposalSchema,
  proposeArchitecture,
} from "./architecture.ts";
import { readGitIdentity } from "./git.ts";
import { inspectLock, processIdentity } from "./lock.ts";
import { pendingPlanning } from "./planning-commit.ts";
import {
  assertSubmoduleEdit,
  assertSubmoduleReady,
  assertSubmodules,
  changedRepositoryPaths,
  parentCommitPaths,
  planSubmoduleCommits,
  readSubmodules,
  submoduleCommitPaths,
  submoduleCommitSchema,
  submoduleSnapshotSchema,
} from "./submodules.ts";

const execute = promisify(execFile);
const checkpointSchema = z.looseObject({
  schema: z.literal(1),
  run: schemas.run.shape.id,
  action: schemas.action.shape.id,
  agent: z.enum(["claude-code", "codex"]),
  ownerToken: z.string(),
  ownerPid: z.number().int().positive().optional(),
  ownerProcessStartedAt: z.string().optional(),
  ownerHost: z.string().optional(),
  runPath: z.string(),
  actionPath: z.string(),
  actionHash: z.string().regex(/^[a-f0-9]{64}$/),
  runHash: z.string().regex(/^[a-f0-9]{64}$/),
  phase: z.enum([
    "started",
    "prepared",
    "commit-pending",
    "committed",
    "finalized",
    "unsupported",
    "failed",
    "interrupted",
  ]),
  baseCommit: z.string().nullable(),
  mode: z.enum(["go", "plan"]).optional(),
  taskRunKind: z.enum(["planning", "implementation", "quality"]).optional(),
  sourceSnapshot: z.record(z.string(), z.string().nullable()).optional(),
  submodules: z.record(z.string(), submoduleSnapshotSchema).optional(),
  submoduleCommits: z.array(submoduleCommitSchema).optional(),
  inputHashes: z.record(z.string(), z.string()).optional(),
  priorWork: z.record(z.string(), z.string().nullable()).optional(),
  baseTags: z.string().optional(),
  gitRoot: z.string().nullable().optional(),
  bootstrapGit: z.boolean().optional(),
  bootstrapFiles: z.record(z.string(), z.string()).optional(),
  planRevision: z.string().optional(),
  startingChanges: z.record(z.string(), z.string().nullable()).optional(),
  paths: z.array(z.string()),
  fileHashes: z.record(z.string(), z.string().nullable()),
  commit: z.string().optional(),
  message: z.string().optional(),
  indexBefore: z.string().optional(),
  indexReconciled: z.boolean().optional(),
  release: z
    .strictObject({
      version: schemas.release.shape.version,
      tag: z.string().min(1),
      message: z.string().min(1),
      preparation: releasePreparationSchema.optional(),
    })
    .optional(),
});
export type RunContext = z.infer<typeof checkpointSchema>;
export const reportSchema = z.strictObject({
  summary: z.string().min(1),
  reviews: z
    .strictObject({
      standards: z.strictObject({
        passed: z.boolean(),
        summary: z.string().min(1),
      }),
      plan: z.strictObject({ passed: z.boolean(), summary: z.string().min(1) }),
    })
    .optional(),
  paths: z.array(z.string()),
  checks: z.array(
    z.strictObject({ name: z.string().min(1), passed: z.boolean() }),
  ),
});
export type RunReport = z.infer<typeof reportSchema>;
export type RunOptions = {
  checkpoint?: (point: string) => Promise<void> | void;
  writeCheckpoint?: import("voidra").WriteOptions["checkpoint"];
};
function releaseIntent(
  action: Action,
  revision: string | undefined,
): NonNullable<RunContext["release"]> {
  if (
    action.type !== "release" ||
    !["review", "released"].includes(action.stage ?? "") ||
    action.reviewDecision?.decision !== "accepted" ||
    action.reviewDecision.revision !== revision ||
    !action.releaseActions?.length ||
    !action.releaseFiles ||
    !action.releaseVersion ||
    !action.releaseTag ||
    !action.releaseMessage
  )
    throw new Error("Release requires a complete, unchanged accepted proposal");
  return {
    version: action.releaseVersion,
    tag: action.releaseTag,
    message: action.releaseMessage,
    ...(action.releasePreparation
      ? { preparation: action.releasePreparation }
      : {}),
  };
}
const releasePlanSchema = z.strictObject({
  preparation: releasePreparationSchema.optional(),
  version: schemas.release.shape.version,
  tag: z.string().min(1),
  message: z.string().min(1),
  paths: z.array(z.string().min(1)),
  notes: z.string().min(1),
  requirements: z.string().min(1),
  blueprint: z.string().min(1),
  acceptance: z.string().min(1),
  actions: z
    .array(
      z.strictObject({
        id: schemas.action.shape.id,
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .optional(),
});
export async function publishReleasePlan(
  root: string,
  token: string,
  raw: z.input<typeof releasePlanSchema>,
): Promise<void> {
  const report = releasePlanSchema.parse(raw),
    { ctx } = await owned(root, token),
    { action } = await current(root, ctx);
  if (
    ctx.phase !== "started" ||
    action.type !== "release" ||
    action.stage !== "plan"
  )
    throw new Error("Release proposals require an owned Plan run");
  await assertPlanningEffects(root, ctx);
  if (
    /^Voidra-(Action|Run):/m.test(report.message) ||
    report.tag.startsWith("-")
  )
    throw new Error("Invalid release message or tag");
  await git(root, ["check-ref-format", `refs/tags/${report.tag}`]);
  if (
    await git(root, ["rev-parse", "--verify", `refs/tags/${report.tag}`]).catch(
      () => "",
    )
  )
    throw new Error("The proposed tag already exists");
  if (new Set(report.paths).size !== report.paths.length)
    throw new Error("Duplicate release path");
  for (const path of report.paths) {
    await safeGitPath(root, path);
    if (path.startsWith(".voidra/"))
      throw new Error("Version/changelog paths must be repository files");
  }
  const project = await checkProject(root),
    candidates = new Map(
      releaseCandidates(project, action.id).map((candidate) => [
        candidate.id,
        candidate,
      ]),
    );
  for (const [path, expected] of Object.entries(ctx.inputHashes ?? {}))
    if (hash(project.files.get(path) ?? "") !== expected)
      throw new Error(`Consumed record changed: ${path}`);
  const selected =
    report.actions ??
    (action.releaseActions ?? []).map((id) => {
      const candidate = candidates.get(id);
      if (!candidate)
        throw new Error("Selected release work is no longer eligible");
      return { id, revision: candidate.revision };
    });
  if (
    !selected.length ||
    new Set(selected.map((member) => member.id)).size !== selected.length
  )
    throw new Error("Choose completed, unreleased work once");
  for (const member of selected)
    if (candidates.get(member.id)?.revision !== member.revision)
      throw new Error("Release selection changed or is ineligible");
  const preparation = report.preparation ?? action.releasePreparation;
  if (project.metadata?.taskTracking === 1 && !preparation)
    throw Error(
      "Tracked releases require an explicit version and Done-ticket preparation choice",
    );
  if (preparation) {
    if (
      preparation.version !== report.version ||
      !report.paths.includes(preparation.source.path)
    )
      throw Error(
        "Release preparation must match the proposed version and include its selected package path",
      );
    await checkReleasePreparation(
      root,
      project,
      preparation,
      selected.map((member) => member.id),
    );
  }
  const recordPath = `.voidra/releases/${report.version}.md`,
    prior = project.records.get(recordPath)?.document;
  if (
    prior &&
    (prior.data.action !== action.id || prior.data.status === "released")
  )
    throw new Error("This version belongs to another release");
  const next: Action = {
    ...action,
    releaseActions: selected.map((member) => member.id),
    ...(preparation ? { releasePreparation: preparation } : {}),
    releaseVersion: report.version,
    releaseTag: report.tag,
    releaseFiles: report.paths,
    releaseMessage: report.message,
    title: `Release ${report.version}`,
  };
  const changes: Parameters<typeof applyOperation>[1]["changes"] = [];
  for (const [file, body] of Object.entries({
    "requirements.md": report.requirements,
    "blueprint.md": report.blueprint,
    "acceptance.md": report.acceptance,
  })) {
    const path = `.voidra/actions/${action.id}/${file}`,
      old = project.records.get(path)?.document;
    changes.push({
      path,
      expectedHash: old ? hash(old.raw) : null,
      content: serializeRecord(
        old ?? parseRecord(path, "---\n{}\n---\n"),
        { ...(old?.data ?? {}), action: action.id },
        body,
      ).toString(),
    });
  }
  changes.push({
    path: recordPath,
    expectedHash: prior ? hash(prior.raw) : null,
    content: serializeRecord(
      prior ?? parseRecord(recordPath, "---\n{}\n---\n"),
      {
        ...(prior?.data ?? {}),
        version: report.version,
        action: action.id,
        actions: next.releaseActions,
        tag: report.tag,
        status: "draft",
      },
      report.notes,
    ).toString(),
  });
  if (action.releaseVersion && action.releaseVersion !== report.version) {
    const oldPath = `.voidra/releases/${action.releaseVersion}.md`,
      old = project.records.get(oldPath)?.document;
    if (old?.data.action === action.id && old.data.status === "draft")
      changes.push({
        path: oldPath,
        expectedHash: hash(old.raw),
        content: serializeRecord(old, {
          ...old.data,
          supersededByVersion: report.version,
        }).toString(),
      });
  }
  for (const member of selected) {
    const path = `.voidra/actions/${member.id}/action.md`;
    changes.push({
      path,
      expectedHash: member.revision,
      content: project.files.get(path)?.toString() ?? null,
    });
  }
  for (const [path, expected] of Object.entries(ctx.inputHashes ?? {}))
    if (!changes.some((change) => change.path === path))
      changes.push({
        path,
        expectedHash: expected,
        content: project.files.get(path)?.toString() ?? null,
      });
  const overlay = new Map(project.files);
  for (const change of changes) {
    if (change.content === null) overlay.delete(change.path);
    else overlay.set(change.path, Buffer.from(change.content));
  }
  overlay.set(
    ctx.actionPath,
    serializeRecord(
      parseRecord(ctx.actionPath, project.files.get(ctx.actionPath) as Buffer),
      next,
    ),
  );
  const plan = readPlan(overlay, action.id);
  if (!plan) throw new Error("Release plan is incomplete");
  let reviewed = next;
  for (let index = 0; index < 8 && reviewed.stage !== "review"; index++)
    reviewed = transition(
      reviewed,
      "advance",
      { plan },
      projectLifecycles(project.metadata),
    ).action;
  if (reviewed.stage !== "review")
    throw new Error("Release proposal did not reach Review");
  await finishAtGate(
    root,
    token,
    reviewed,
    "Release proposal ready for exact Review acceptance. No code, commit or tag was changed.\n",
    changes,
  );
}
async function finalizeRelease(
  root: string,
  ctx: RunContext,
  token: string,
  options: RunOptions,
): Promise<void> {
  if (!ctx.release || !ctx.commit)
    throw new Error("Release commit intent missing");
  const tag = ctx.release.tag;
  await options.checkpoint?.("before-tag");
  await owned(root, token);
  await checkPreparedFiles(root, ctx);
  if ((await head(root)) !== ctx.commit)
    throw new Error("Git HEAD changed before release tagging");
  const target = async (): Promise<string> =>
    git(root, ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]).catch(
      () => "",
    );
  let existing = await target();
  if (existing && existing !== ctx.commit)
    throw new Error("Conflicting release tag; it will not be moved");
  if (!existing) {
    try {
      await git(root, ["tag", "--", tag, ctx.commit]);
    } catch (error) {
      existing = await target();
      if (existing !== ctx.commit) throw error;
    }
  }
  await options.checkpoint?.("after-tag");
  await options.checkpoint?.("before-finalize");
  await owned(root, token);
  await checkPreparedFiles(root, ctx);
  const project = await checkProject(root),
    { action, actionRaw, runRaw } = await current(root, ctx),
    plan = readPlan(project.files, action.id, project.records);
  const endedAt = new Date().toISOString(),
    fileHashes = { ...ctx.fileHashes },
    changes: Parameters<typeof applyOperation>[1]["changes"] = [];
  if (!plan)
    throw new Error("Release plan is missing; obtain fresh acceptance");
  const add = (path: string, content: Buffer): void => {
    changes.push({
      path,
      expectedHash: fileHashes[path] ?? null,
      content: content.toString(),
    });
    fileHashes[path] = hash(content);
  };
  const next = transition(
    action,
    "finalize-release",
    { plan, commit: ctx.commit, tag },
    projectLifecycles(project.metadata),
  ).action;
  const actionBytes = serializeRecord(
      parseRecord(ctx.actionPath, actionRaw),
      next,
    ),
    runBytes = serializeRecord(parseRecord(ctx.runPath, runRaw), {
      ...parseRecord(ctx.runPath, runRaw).data,
      commit: ctx.commit,
      ...(ctx.submoduleCommits?.length
        ? {
            submoduleCommits: ctx.submoduleCommits.map((module) => ({
              path: module.path,
              commit: module.commit,
            })),
          }
        : {}),
      outcome: "advanced",
      toStage: "released",
      endedAt,
    });
  add(ctx.actionPath, actionBytes);
  add(ctx.runPath, runBytes);
  const path = `.voidra/releases/${ctx.release.version}.md`,
    record = project.records.get(path)?.document;
  if (!record) throw new Error("Release proposal record missing");
  add(
    path,
    serializeRecord(record, {
      ...record.data,
      status: "released",
      date: endedAt,
    }),
  );
  for (const id of action.releaseActions ?? []) {
    const memberPath = `.voidra/actions/${id}/action.md`,
      member = project.records.get(memberPath)?.document;
    if (!member) throw new Error("Release member missing");
    add(
      memberPath,
      serializeRecord(member, {
        ...releasedMember(
          schemas.action.parse(member.data),
          ctx.release.version,
        ),
        ...(ctx.release.preparation?.ticketChoice === "move" &&
        ctx.release.preparation.tickets.some((ticket) => ticket.id === id)
          ? { targetRelease: ctx.release.version }
          : {}),
      }),
    );
  }
  const final: RunContext = {
    ...ctx,
    phase: "finalized",
    actionHash: hash(actionBytes),
    runHash: hash(runBytes),
    fileHashes,
    indexReconciled: false,
  };
  await save(root, final, changes, false, options.writeCheckpoint);
  await options.checkpoint?.("after-finalize");
  await reconcileIndex(root, final, token);
}
const checkpointPath = (run: string) =>
  `.voidra/local/run-checkpoints/${run}.json`;
async function assertUnlinked(root: string, path: string): Promise<void> {
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("Private run path contains a symlink");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}
const text = async (root: string, path: string): Promise<string | null> => {
  await assertUnlinked(root, path);
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};
async function git(
  root: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<string> {
  const result = await execute("git", ["--literal-pathspecs", ...args], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "production",
      ...env,
    },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return result.stdout.trim();
}
async function head(root: string): Promise<string | null> {
  try {
    return await git(root, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    return null;
  }
}
async function repositoryRoot(root: string): Promise<string | null> {
  let top: string;
  try {
    top = await git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    try {
      await lstat(join(root, ".git"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    throw new Error("The selected Git repository is invalid");
  }
  const canonical = await realpath(root),
    actual = await realpath(top);
  if (canonical !== actual)
    throw new Error("Select the Git repository root before running");
  return actual;
}
async function tags(root: string): Promise<string> {
  return (await repositoryRoot(root))
    ? git(root, [
        "for-each-ref",
        "--format=%(refname):%(objectname)",
        "refs/tags",
      ])
    : "";
}
async function unchangedPlanningGit(
  root: string,
  ctx: RunContext,
): Promise<void> {
  if (
    (await repositoryRoot(root)) !==
      (ctx.gitRoot === undefined ? await realpath(root) : ctx.gitRoot) ||
    (await head(root)) !== ctx.baseCommit ||
    (await tags(root)) !== ctx.baseTags
  )
    throw new Error("Git repository, HEAD or tags changed during planning");
  await assertSubmodules(root, ctx.submodules);
}
export async function runContext(
  root: string,
  run: string,
): Promise<RunContext> {
  if (!/^run-[0-9a-hjkmnp-tv-z]{6}$/.test(run))
    throw new Error("Invalid run ID");
  const value = await text(root, checkpointPath(run));
  if (value === null) throw new Error("Run checkpoint not found");
  const ctx = checkpointSchema.parse(JSON.parse(value));
  if (
    ctx.run !== run ||
    ctx.actionPath !== `.voidra/actions/${ctx.action}/action.md` ||
    !ctx.runPath.startsWith(`.voidra/actions/${ctx.action}/runs/`) ||
    !ctx.runPath.endsWith(`-${ctx.agent}-${ctx.run}.md`)
  )
    throw new Error("Run checkpoint identity changed");
  for (const path of ctx.paths) {
    await safeGitPath(root, path);
    if (
      path.startsWith(".voidra/") &&
      !path.startsWith(`.voidra/actions/${ctx.action}/`) &&
      !(
        ctx.bootstrapGit &&
        ctx.baseCommit === null &&
        Object.hasOwn(ctx.bootstrapFiles ?? {}, path)
      ) &&
      path !== (ctx.release ? `.voidra/releases/${ctx.release.version}.md` : "")
    )
      throw new Error("Run checkpoint contains another action's files");
  }
  for (const [path, module] of Object.entries(ctx.submodules ?? {})) {
    if (path.split("/").includes(".voidra"))
      throw Error("Submodule checkpoint cannot target planning files");
    await safeGitPath(root, path, true);
    if (
      module.parent &&
      (!Object.hasOwn(ctx.submodules ?? {}, module.parent) ||
        !path.startsWith(`${module.parent}/`))
    )
      throw Error("Invalid submodule parent in run checkpoint");
  }
  if (ctx.submoduleCommits !== undefined) {
    const expected = submoduleCommitPaths(ctx.paths, ctx.submodules ?? {});
    const actual = ctx.submoduleCommits.map((module) => ({
      path: module.path,
      paths: module.paths,
    }));
    if (
      JSON.stringify(expected) !== JSON.stringify(actual) ||
      ctx.submoduleCommits.some(
        (module) => module.baseCommit !== ctx.submodules?.[module.path]?.head,
      )
    )
      throw Error("Submodule commit scope changed in the run checkpoint");
  }
  return ctx;
}
async function owned(
  root: string,
  token: string,
): Promise<{
  ctx: RunContext;
  lock: z.infer<typeof schemas.lock>;
  lockRaw: string;
}> {
  const lockRaw = await text(root, ".voidra/local/run.lock");
  if (!lockRaw) throw new Error("Run owner lock was lost");
  const lock = schemas.lock.parse(JSON.parse(lockRaw));
  if (lock.ownerToken !== token)
    throw new Error("Run owner token changed; stop before another write");
  if (
    lock.host !== hostname() ||
    (await processIdentity(lock.pid)) !== lock.processStartedAt
  )
    throw new Error("Run owner is not active on this computer");
  const ctx = await runContext(root, lock.run);
  if (ctx.ownerToken !== token) throw new Error("Run checkpoint owner differs");
  return { ctx, lock, lockRaw };
}
async function save(
  root: string,
  ctx: RunContext,
  changes: Parameters<typeof applyOperation>[1]["changes"] = [],
  allowGlossary = false,
  writeCheckpoint?: import("voidra").WriteOptions["checkpoint"],
): Promise<void> {
  const path = checkpointPath(ctx.run),
    old = await text(root, path);
  if (!changes.some((change) => change.path === ".voidra/local/run.lock")) {
    const lockRaw = await text(root, ".voidra/local/run.lock");
    if (
      lockRaw === null ||
      schemas.lock.parse(JSON.parse(lockRaw)).ownerToken !== ctx.ownerToken
    )
      throw new Error("Run owner token changed before writing");
    changes = [
      ...changes,
      {
        path: ".voidra/local/run.lock",
        expectedHash: hash(lockRaw),
        content: lockRaw,
      },
    ];
  }
  await applyOperation(
    root,
    withActionSequence(await checkProject(root), {
      changes: [
        ...changes,
        {
          path,
          expectedHash: old === null ? null : hash(old),
          content: `${JSON.stringify(checkpointSchema.parse(ctx), null, 2)}\n`,
        },
      ],
    }),
    {
      allowGlossary,
      ...(writeCheckpoint ? { checkpoint: writeCheckpoint } : {}),
    },
  );
}
async function current(
  root: string,
  ctx: RunContext,
): Promise<{ action: Action; actionRaw: string; runRaw: string }> {
  const checked = await checkProject(root);
  if (
    checked.diagnostics.some(
      (d) => !["stale-approval", "stale-review"].includes(d.code),
    )
  )
    throw new Error("Planning files are invalid or need recovery");
  const actionRaw = await text(root, ctx.actionPath),
    runRaw = await text(root, ctx.runPath);
  if (
    !actionRaw ||
    !runRaw ||
    hash(actionRaw) !== ctx.actionHash ||
    hash(runRaw) !== ctx.runHash
  )
    throw new Error(
      "Action or run changed outside this owner; recovery conflict",
    );
  return {
    action: schemas.action.parse(parseRecord(ctx.actionPath, actionRaw).data),
    actionRaw,
    runRaw,
  };
}
export async function inspectOwnedRun(root: string, token: string) {
  const result = await owned(root, token);
  await current(root, result.ctx);
  return result;
}
export async function startRun(
  root: string,
  agent: RunContext["agent"],
  ownerPid = process.pid,
  mode: "go" | "plan" = "go",
): Promise<RunContext | null> {
  const checked = await checkProject(root);
  if (
    checked.diagnostics.some(
      (d) => !["stale-approval", "stale-review"].includes(d.code),
    )
  )
    throw new Error(
      "Fix planning validation/recovery problems before starting",
    );
  if (checked.files.has(".voidra/local/run.lock"))
    throw new Error("A run lock already has an owner");
  if (
    checked.files.has(".voidra/local/planning.lock") ||
    (await pendingPlanning(root)).length
  )
    throw new Error(
      "Finish or recover the planning commit before starting an agent run",
    );
  const queuePath = ".voidra/local/pending-actions.md",
    queue = checked.records.get(queuePath)?.document;
  if (!queue) return null;
  const ids = Array.from(
    queue.body.matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g),
    (m) => m[0],
  );
  const ordered = queue.data.orderedIntent === 1;
  const sequence = ordered ? readActionSequence(checked) : null;
  if (ordered && !sequence?.enabled)
    throw Error("Repair the versioned Actions sequence before running");
  const positions = new Map(
    sequence?.order.map((id, index) => [id, index]) ?? [],
  );
  const candidates = ordered
    ? [...ids].sort(
        (a, b) =>
          (positions.get(a) ?? Infinity) - (positions.get(b) ?? Infinity),
      )
    : ids;
  const actionId = ordered
    ? candidates.find(
        (id) => queueDecision(checked, id, { stopAtStalePlan: true }).allowed,
      )
    : ids[0];
  if (!actionId) return null;
  const actionPath = `.voidra/actions/${actionId}/action.md`,
    doc = checked.records.get(actionPath)?.document;
  if (!doc) throw new Error("Queued action not found");
  const action = schemas.action.parse(doc.data);
  const workflowKind = taskRunKind(action);
  const decision = queueDecision(checked, actionId, { stopAtStalePlan: true });
  if (!decision.allowed)
    throw new Error(decision.reason ?? "Queued action cannot run");
  if (
    action.type === "release" &&
    action.stage === "review" &&
    action.reviewDecision?.decision === "accepted" &&
    action.releasePreparation
  )
    await checkReleasePreparation(
      root,
      checked,
      action.releasePreparation,
      action.releaseActions ?? [],
    );
  const identity = await processIdentity(ownerPid);
  if (!identity) throw new Error("Run owner process is missing");
  const repository = await repositoryRoot(root);
  if (
    repository &&
    ["implementation", "quality"].includes(workflowKind ?? "")
  ) {
    let committedReader = "";
    try {
      committedReader = schemas.project.parse(
        JSON.parse(await git(root, ["show", "HEAD:.voidra/voidra.json"])),
      ).requiredVoidra;
    } catch {
      /* An absent committed baseline needs an explicit planning commit too. */
    }
    const [major = 0, minor = 0] = committedReader.split(".").map(Number);
    if (!(major > 1 || (major === 1 && minor >= 2)))
      throw Error(
        "Commit the task-workflow metadata upgrade before implementation or QA. Open Actions → Execution options → Commit planning changes and include .voidra/voidra.json.",
      );
  }
  const rules = projectLifecycles(checked.metadata),
    plan = readPlan(checked.files, action.id, checked.records);
  const stale =
    rules[action.type].planGate &&
    ["implement", "verify", "review"].includes(action.stage ?? "") &&
    (!action.planApproval ||
      !plan ||
      Object.entries(plan.hashes).some(
        ([name, value]) =>
          action.planApproval?.hashes[name as keyof typeof plan.hashes] !==
          value,
      ));
  const boundary =
    mode === "plan" &&
    workflowKind !== "planning" &&
    !["discovery", "plan"].includes(action.stage ?? "");
  const planning =
      mode === "plan" ||
      workflowKind === "planning" ||
      stale ||
      ["discovery", "plan"].includes(action.stage ?? ""),
    bootstrapGit =
      !repository &&
      !planning &&
      action.type === "feature" &&
      action.title === "Bootstrap" &&
      ["implement", "verify"].includes(action.stage ?? "") &&
      !!action.planApproval &&
      !!plan &&
      Object.entries(plan.hashes).every(
        ([name, value]) =>
          action.planApproval?.hashes[name as keyof typeof plan.hashes] ===
          value,
      );
  if (!repository && !planning && !bootstrapGit)
    throw new Error(
      "The project must be a local Git repository before implementation",
    );
  if (!action.assignee) {
    const runner = await readGitIdentity(root);
    if (!runner.value && !planning)
      throw new Error(
        "Configure Git name and email before starting unassigned work",
      );
    if (runner.value) action.assignee = runner.value;
  }
  if (
    action.stage === "review" &&
    action.type !== "release" &&
    workflowKind !== "quality" &&
    !checked.records.get(`.voidra/actions/${action.id}/questions.md`)
  )
    throw new Error("Review needs a human decision");
  let startedAction: Action = { ...action, status: "running" };
  if (stale)
    startedAction = {
      ...action,
      stage: "plan",
      status: "waiting",
      ...(action.taskWorkflow === 1
        ? { taskColumn: "planning", workflowPlanned: false }
        : {}),
    };
  else if (boundary) startedAction = action;
  else if (
    action.stage === "review" &&
    action.type !== "release" &&
    workflowKind !== "quality"
  )
    startedAction = {
      ...action,
      stage: rules[action.type].rejectTo,
      status: "running",
      resumedAfterQuestions: true,
    };
  const submodules = repository ? await readSubmodules(root) : {};
  const sourceSnapshot = await snapshotSources(root);
  const bootstrapFiles = bootstrapGit
    ? Object.fromEntries(
        [...checked.files]
          .filter(
            ([path]) =>
              !path.startsWith(".voidra/local/") &&
              !path.startsWith(`.voidra/actions/${action.id}/`) &&
              (checked.records.has(path) ||
                [
                  ".voidra/voidra.json",
                  ".voidra/README.md",
                  ".voidra/.gitignore",
                ].includes(path)),
          )
          .map(([path, bytes]) => [path, hash(bytes)]),
      )
    : undefined;
  const previous = await listRunContexts(root),
    priorWork: Record<string, string | null> = {};
  for (const ctx of previous.filter(
    (c) =>
      c.action === action.id && c.phase === "finalized" && c.indexReconciled,
  ))
    for (const [path, value] of Object.entries(ctx.fileHashes)) {
      if (
        !path.startsWith(".voidra/") &&
        sourceSnapshot[path] === value &&
        ctx.sourceSnapshot?.[path] !== value &&
        (!Object.hasOwn(ctx.startingChanges ?? {}, path) ||
          ctx.priorWork?.[path] === ctx.sourceSnapshot?.[path])
      )
        priorWork[path] = value;
    }
  const run = createId(
      "run",
      new Set(
        [...checked.records.values()].map((r) => String(r.document.data.id)),
      ),
    ),
    at = new Date().toISOString(),
    ownerToken = randomUUID();
  const runPath = `.voidra/actions/${actionId}/runs/${at.replaceAll(":", "")}-${agent}-${run}.md`;
  const runData = schemas.run.parse({
    id: run,
    action: actionId,
    agent,
    startedAt: at,
    fromStage: action.stage,
    outcome: stale || boundary ? "waiting" : "running",
    ...(stale || boundary
      ? { endedAt: at, toStage: startedAction.stage, planningOnly: true }
      : {}),
    ...(ordered
      ? {
          orderedIntent: {
            version: 1,
            revision: hash(checked.files.get(ACTION_SEQUENCE_PATH) as Buffer),
            queueRevision: hash(queue.raw),
          },
        }
      : {}),
    consumedRecords: [
      ...new Set([
        ...Object.keys(bootstrapFiles ?? {}).filter((path) =>
          checked.records.has(path),
        ),
        actionId,
        actionPath,
        ".voidra/voidra.json",
        ...(action.blockedBy ?? []),
        ...(action.releaseActions ?? []),
        ...(action.releaseVersion
          ? [`.voidra/releases/${action.releaseVersion}.md`]
          : []),
        ...[...checked.records.values()]
          .filter(
            (r) =>
              r.kind === "profile" ||
              r.kind === "idea" ||
              (r.document.file.startsWith(`.voidra/actions/${actionId}/`) &&
                [
                  "questions",
                  "requirements",
                  "blueprint",
                  "acceptance",
                ].includes(r.kind)),
          )
          .flatMap((r) => [
            r.document.file,
            ...(r.kind === "questions"
              ? schemas.questions
                  .parse(r.document.data)
                  .rounds.flatMap((round) => round.questions.map((q) => q.id))
              : []),
          ]),
        ...(action.links ?? []).filter((link) =>
          /^(act|idea|q)-[0-9a-hjkmnp-tv-z]{6}$/.test(link),
        ),
      ]),
    ],
  });
  const actionRaw = serializeRecord(doc, startedAction).toString(),
    runRaw = serializeRecord(
      parseRecord(runPath, "---\n{}\n---\n"),
      runData,
      "Run started; consumed records are persisted before work.\n",
    ).toString();
  const ctx: RunContext = {
    schema: 1,
    ...(workflowKind ? { taskRunKind: workflowKind } : {}),
    run,
    action: actionId,
    agent,
    ownerToken,
    ownerPid,
    ownerProcessStartedAt: identity,
    ownerHost: hostname(),
    runPath,
    actionPath,
    actionHash: hash(actionRaw),
    runHash: hash(runRaw),
    phase: stale || boundary ? "finalized" : "started",
    ...(stale || boundary ? { indexReconciled: true } : {}),
    mode,
    sourceSnapshot,
    submodules,
    priorWork,
    inputHashes: Object.fromEntries(
      [...checked.files]
        .filter(
          ([path]) =>
            path === ".voidra/voidra.json" ||
            path.startsWith(".voidra/profile/") ||
            path.startsWith(".voidra/backlog/") ||
            (action.releaseVersion &&
              path === `.voidra/releases/${action.releaseVersion}.md`) ||
            (action.releaseActions ?? []).some(
              (id) => path === `.voidra/actions/${id}/action.md`,
            ) ||
            (path.startsWith(`.voidra/actions/${action.id}/`) &&
              ![actionPath].includes(path) &&
              !path.includes("/runs/")),
        )
        .map(([path, bytes]) => [path, hash(bytes)]),
    ),
    baseTags: await tags(root),
    gitRoot: bootstrapGit ? await realpath(root) : repository,
    ...(bootstrapGit ? { bootstrapGit: true, bootstrapFiles } : {}),
    ...(plan ? { planRevision: plan.revision } : {}),
    baseCommit: await head(root),
    startingChanges: repository
      ? Object.fromEntries(
          await Promise.all(
            (await changedRepositoryPaths(root, submodules))
              .filter((path) => !path.startsWith(".voidra/"))
              .map(async (path) => [path, await fileHash(root, path)]),
          ),
        )
      : { ...sourceSnapshot },
    paths: [],
    fileHashes: {},
  };
  const lock = schemas.lock.parse({
    ownerToken,
    pid: ownerPid,
    processStartedAt: identity,
    agent,
    host: hostname(),
    run,
    action: actionId,
    startedAt: at,
    heartbeatAt: at,
  });
  await save(root, ctx, [
    { path: actionPath, expectedHash: hash(doc.raw), content: actionRaw },
    ...[...new Set(action.blockedBy ?? [])].map((id) => {
      const path = `.voidra/actions/${id}/action.md`,
        bytes = checked.files.get(path);
      return {
        path,
        expectedHash: bytes ? hash(bytes) : null,
        content: bytes?.toString() ?? null,
      };
    }),
    { path: runPath, expectedHash: null, content: runRaw },
    { path: ".voidra/local/planning.lock", expectedHash: null, content: null },
    ...(ordered
      ? [
          {
            path: ACTION_SEQUENCE_PATH,
            expectedHash: hash(
              checked.files.get(ACTION_SEQUENCE_PATH) as Buffer,
            ),
            content:
              checked.files.get(ACTION_SEQUENCE_PATH)?.toString() ?? null,
          },
        ]
      : []),
    {
      path: queuePath,
      expectedHash: hash(queue.raw),
      content: serializeRecord(
        queue,
        queue.data,
        ids
          .filter((id) => id !== actionId)
          .map((id, index) => `${index + 1}. [ ] ${id}`)
          .join("\n"),
      ).toString(),
    },
    {
      path: ".voidra/local/run.lock",
      expectedHash: null,
      content: stale || boundary ? null : JSON.stringify(lock),
    },
  ]);
  if (stale || boundary) return runContext(root, run);
  if (bootstrapGit) {
    await guardRun(root, ownerToken, [], true);
    await git(root, ["init", "--quiet"]);
    if (
      (await repositoryRoot(root)) !== ctx.gitRoot ||
      (await head(root)) !== null ||
      (await tags(root)) !== ""
    )
      throw new Error("Bootstrap Git initialization changed outside this run");
  }
  return ctx;
}
export async function heartbeat(root: string, token: string): Promise<void> {
  const { lock, lockRaw } = await owned(root, token);
  await applyOperation(root, {
    changes: [
      {
        path: ".voidra/local/run.lock",
        expectedHash: hash(lockRaw),
        content: JSON.stringify({
          ...lock,
          heartbeatAt: new Date().toISOString(),
        }),
      },
    ],
  });
}
async function safeGitPath(
  root: string,
  path: string,
  allowDirectory = false,
): Promise<void> {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.split("/").some((p) => p === ".." || p === ".git") ||
    /(?:^|\/)\.voidra\/local(?:\/|$)/.test(path)
  )
    throw new Error("Invalid implementation commit path");
  const absoluteRoot = resolve(root);
  let parent = resolve(root, path);
  if (relative(absoluteRoot, parent).startsWith(".."))
    throw new Error("Commit path escapes project");
  while (parent !== absoluteRoot) {
    try {
      const info = await lstat(parent);
      if (info.isSymbolicLink())
        throw new Error("Commit paths cannot be symlinks");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    parent = dirname(parent);
  }
  const leaf = await lstat(join(root, path)).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (!allowDirectory && leaf?.isDirectory())
    throw Error("Commit paths must name exact files, not directories");
  const canonical = await realpath(root);
  if (relative(canonical, join(canonical, path)).startsWith(".."))
    throw new Error("Commit path escapes project");
}
export async function prepareResult(
  root: string,
  token: string,
  input: RunReport,
): Promise<void> {
  const report = reportSchema.parse(input),
    { ctx } = await owned(root, token);
  if (ctx.phase !== "started")
    throw new Error("Run result is already prepared");
  if (report.checks.some((check) => !check.passed))
    throw new Error("Failed checks cannot advance to Review");
  await guardRun(root, token, report.paths);
  const { action, actionRaw, runRaw } = await current(root, ctx);
  const project = await checkProject(root),
    plan = readPlan(project.files, action.id, project.records);
  if (
    ctx.mode === "plan" ||
    ctx.taskRunKind === "planning" ||
    ctx.taskRunKind === "quality" ||
    action.type === "research"
  )
    throw new Error("This run cannot prepare an implementation commit");
  if (action.type !== "docs" && !report.reviews)
    throw new Error("Both standards and plan review are required");
  if (
    report.reviews &&
    (!report.reviews.standards.passed || !report.reviews.plan.passed)
  )
    throw new Error("Fix both review parts before preparing");
  const rules = projectLifecycles(project.metadata);
  const release =
    action.type === "release"
      ? releaseIntent(action, plan?.revision)
      : undefined;
  if (
    release &&
    JSON.stringify([...report.paths].sort()) !==
      JSON.stringify([...(action.releaseFiles ?? [])].sort())
  )
    throw new Error(
      "Release paths must match the accepted version/changelog files",
    );
  if (release?.preparation) {
    const source = await readProjectRelease(
      root,
      release.preparation.source.path,
    );
    if (source.version !== release.version)
      throw Error(
        "Selected package must contain the accepted new release version before preparation",
      );
  }
  let next = release ? { ...action, status: "ready" as const } : action;
  for (let i = 0; i < 8 && next.stage !== "review"; i++)
    next = transition(next, "advance", plan ? { plan } : {}, rules).action;
  if (next.stage !== "review")
    throw new Error("The run has not reached its result gate");
  for (const path of report.paths) {
    await safeGitPath(root, path);
    if (
      path.startsWith(".voidra/") &&
      !path.startsWith(`.voidra/actions/${ctx.action}/`)
    )
      throw new Error("Do not commit another action's planning files");
  }
  const preparedRun = serializeRecord(
    parseRecord(ctx.runPath, runRaw),
    {
      ...parseRecord(ctx.runPath, runRaw).data,
      outcome: "advanced",
      endedAt: new Date().toISOString(),
      toStage: "review",
      checks: report.checks,
      paths: report.paths,
      ...(report.reviews ? { reviews: report.reviews } : {}),
    },
    `## Summary\n${report.summary}\n\n## Changed files\n${report.paths.map((path) => `- ${path}`).join("\n") || "None."}\n${report.reviews ? `\n## Reviews\nStandards: ${report.reviews.standards.summary}\n\nPlan: ${report.reviews.plan.summary}\n` : ""}`,
  ).toString();
  const preparedAction = serializeRecord(
    parseRecord(ctx.actionPath, actionRaw),
    next,
  ).toString();
  const paths = [
    ...new Set([
      ...report.paths,
      ...Object.keys(ctx.bootstrapFiles ?? {}),
      ...(release ? [`.voidra/releases/${release.version}.md`] : []),
      ...[...project.files.keys()].filter((path) =>
        path.startsWith(`.voidra/actions/${ctx.action}/`),
      ),
      ctx.actionPath,
      ctx.runPath,
    ]),
  ];
  const fileHashes: RunContext["fileHashes"] = {};
  for (const path of paths) {
    const value =
      path === ctx.actionPath
        ? preparedAction
        : path === ctx.runPath
          ? preparedRun
          : await text(root, path);
    fileHashes[path] =
      path === ctx.actionPath || path === ctx.runPath
        ? value === null
          ? null
          : hash(value)
        : (ctx.bootstrapFiles?.[path] ?? (await fileHash(root, path)));
  }
  if (release)
    for (const member of action.releaseActions ?? []) {
      const path = `.voidra/actions/${member}/action.md`;
      fileHashes[path] = await fileHash(root, path);
    }
  const submoduleCommits = await planSubmoduleCommits(
    root,
    paths,
    ctx.submodules ?? {},
  );
  for (const module of submoduleCommits) {
    const identity = await readGitIdentity(join(root, module.path));
    if (!identity.value)
      throw Error(
        `Configure Git name and email in submodule ${module.path} before preparing`,
      );
  }
  await save(
    root,
    {
      ...ctx,
      phase: "prepared",
      paths,
      fileHashes,
      submoduleCommits,
      actionHash: hash(preparedAction),
      runHash: hash(preparedRun),
      ...(release ? { release, message: release.message } : {}),
    },
    [
      {
        path: ctx.actionPath,
        expectedHash: hash(actionRaw),
        content: preparedAction,
      },
      { path: ctx.runPath, expectedHash: hash(runRaw), content: preparedRun },
    ],
  );
}
async function findCommit(
  root: string,
  ctx: RunContext,
): Promise<string | null> {
  if (!(await head(root))) return null;
  const values = (
    await git(root, ["log", "--all", "--format=%H%x00%B%x00"])
  ).split("\0");
  const found: string[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    const commit = values[i]?.trim(),
      body = values[i + 1] ?? "";
    if (
      commit &&
      body.split("\n").includes(`Voidra-Action: ${ctx.action}`) &&
      body.split("\n").includes(`Voidra-Run: ${ctx.run}`)
    )
      found.push(commit);
  }
  if (found.length > 1)
    throw new Error("Conflicting duplicate run trailers; inspect Git history");
  return found[0] ?? null;
}
async function fileHash(root: string, path: string): Promise<string | null> {
  try {
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink())
      return hash(`link:${await readlink(join(root, path))}`);
    // An untracked embedded repository can be reported as one directory entry.
    // Its descendants are protected by the pre-existing-edit prefix guard.
    if (info.isDirectory()) return hash("directory");
    return hash(await readFile(join(root, path)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function checkPreparedFiles(
  root: string,
  ctx: RunContext,
): Promise<void> {
  await current(root, ctx);
  await assertSubmodules(root, ctx.submodules, ctx.submoduleCommits);
  if (ctx.release) {
    const project = await checkProject(root),
      action = schemas.action.parse(
        project.records.get(ctx.actionPath)?.document.data,
      ),
      plan = readPlan(project.files, ctx.action, project.records),
      intent = releaseIntent(action, plan?.revision);
    if (
      plan?.revision !== ctx.planRevision ||
      JSON.stringify(intent) !== JSON.stringify(ctx.release)
    )
      throw new Error("Release proposal changed; obtain fresh acceptance");
  }
  for (const [path, expected] of Object.entries(ctx.fileHashes)) {
    await safeGitPath(root, path);
    if ((await fileHash(root, path)) !== expected)
      throw new Error(`Prepared file changed: ${path}`);
  }
}
async function selectedIndex(root: string, paths: string[]): Promise<string> {
  return git(root, ["ls-files", "--stage", "-z", "--", ...paths]);
}
function moduleIndex(root: string, run: string, path: string): string {
  return join(
    root,
    `.voidra/local/commit-index-${run}-${hash(path).slice(0, 16)}`,
  );
}
async function reconcileModuleReceipts(
  root: string,
  ctx: RunContext,
): Promise<RunContext> {
  let result = ctx;
  for (const module of result.submoduleCommits ?? []) {
    const repository = join(root, module.path);
    const existing = await findCommit(repository, result);
    if (module.commit && existing !== module.commit)
      throw Error(`Submodule commit receipt changed: ${module.path}`);
    if (!existing) continue;
    if (
      (await head(repository)) !== existing ||
      (await git(repository, ["rev-parse", `${existing}^`])) !==
        module.baseCommit
    )
      throw Error(
        `Submodule commit history changed outside this run: ${module.path}`,
      );
    if (!module.commit) {
      if (result.phase !== "commit-pending" && result.phase !== "committed")
        throw Error("Submodule commit has no persisted intent");
      result = {
        ...result,
        submoduleCommits: result.submoduleCommits?.map((plan) =>
          plan.path === module.path ? { ...plan, commit: existing } : plan,
        ),
      };
      await save(root, result);
    }
  }
  return result;
}
export async function commitResult(
  root: string,
  token: string,
  message: string,
  options: RunOptions = {},
): Promise<string> {
  let { ctx } = await owned(root, token);
  if (ctx.release && message !== ctx.release.message)
    throw Error("Commit message differs from the accepted release proposal");
  if (ctx.mode === "plan") throw Error("Planning-only runs cannot commit");
  if (/^Voidra-(Action|Run):/m.test(message))
    throw Error("The runtime owns commit trailers");
  if (!["prepared", "commit-pending", "committed"].includes(ctx.phase))
    throw Error("Prepare the result before committing");
  if (ctx.submoduleCommits?.length && ctx.message && ctx.message !== message)
    throw Error("Commit message changed after submodule commit intent");
  ctx = await reconcileModuleReceipts(root, ctx);
  const existing = await findCommit(root, ctx);
  if (existing) {
    await checkPreparedFiles(root, ctx);
    if (ctx.submoduleCommits?.length && (await head(root)) !== existing)
      throw Error("Git HEAD changed outside this run");
    await save(root, { ...ctx, phase: "committed", commit: existing });
    return existing;
  }
  await checkPreparedFiles(root, ctx);
  if ((await head(root)) !== ctx.baseCommit)
    throw Error("Git HEAD changed outside this run");
  const rootPaths = parentCommitPaths(ctx.paths, ctx.submoduleCommits ?? []);
  const indexBefore = await selectedIndex(root, rootPaths);
  if (ctx.indexBefore !== undefined && ctx.indexBefore !== indexBefore)
    throw Error("Git index changed outside the run");
  // Refuse every selected index conflict before creating the first child commit.
  for (const module of ctx.submoduleCommits ?? []) {
    await assertSubmoduleReady(root, module.path);
    if (
      (await selectedIndex(join(root, module.path), module.paths)) !==
      module.indexBefore
    )
      throw Error(
        `Submodule Git index changed outside this run: ${module.path}`,
      );
  }
  let pending: RunContext = {
    ...ctx,
    phase: "commit-pending",
    message,
    indexBefore,
  };
  await save(root, pending);
  await options.checkpoint?.("before-commit");
  const body = `${message}\n\nVoidra-Action: ${ctx.action}\nVoidra-Run: ${ctx.run}`;
  for (const module of pending.submoduleCommits ?? []) {
    if (module.commit) continue;
    await owned(root, token);
    await checkPreparedFiles(root, pending);
    await assertSubmoduleReady(root, module.path);
    const repository = join(root, module.path),
      env = { GIT_INDEX_FILE: moduleIndex(root, ctx.run, module.path) };
    if ((await selectedIndex(repository, module.paths)) !== module.indexBefore)
      throw Error(
        `Submodule Git index changed outside this run: ${module.path}`,
      );
    await git(repository, ["read-tree", module.baseCommit], env);
    await git(repository, ["add", "--", ...module.paths], env);
    await git(repository, ["commit", "-m", body], env);
    await options.checkpoint?.(`after-submodule-commit:${module.path}`);
    const commit = await findCommit(repository, pending);
    if (!commit)
      throw Error(`Submodule commit trailer was not found: ${module.path}`);
    pending = {
      ...pending,
      submoduleCommits: pending.submoduleCommits?.map((plan) =>
        plan.path === module.path ? { ...plan, commit } : plan,
      ),
    };
    await save(root, pending);
  }
  await owned(root, token);
  await checkPreparedFiles(root, pending);
  if (
    (await head(root)) !== pending.baseCommit ||
    (await selectedIndex(root, rootPaths)) !== indexBefore
  )
    throw Error("Parent HEAD or Git index changed outside this run");
  const index = join(root, `.voidra/local/commit-index-${ctx.run}`),
    env = { GIT_INDEX_FILE: index };
  await git(
    root,
    ["read-tree", ...(ctx.baseCommit ? [ctx.baseCommit] : ["--empty"])],
    env,
  );
  await git(root, ["add", "--", ...rootPaths], env);
  await git(root, ["commit", "-m", body], env);
  await options.checkpoint?.("after-commit");
  const commit = await findCommit(root, pending);
  if (!commit) throw Error("Commit trailer was not found");
  await save(root, { ...pending, phase: "committed", commit });
  return commit;
}
async function reconcileSelectedIndex(
  root: string,
  paths: string[],
  before: string | undefined,
  commit: string,
): Promise<void> {
  if ((await head(root)) !== commit)
    throw Error("Git HEAD changed before index reconciliation");
  const staged = await selectedIndex(root, paths),
    tree = await git(root, ["ls-tree", "-z", commit, "--", ...paths]);
  const after =
    tree
      .split("\0")
      .filter(Boolean)
      .map((row) => row.replace(/^(\d+) \w+ ([a-f0-9]+)\t/, "$1 $2 0\t"))
      .join("\0") + (tree ? "\0" : "");
  if (staged !== before && staged !== after)
    throw Error("Git index changed outside the run; preserved");
  await git(root, ["reset", "-q", "HEAD", "--", ...paths]);
}
async function reconcileIndex(
  root: string,
  ctx: RunContext,
  token: string,
): Promise<void> {
  if (!ctx.commit) throw Error("Missing commit for index reconciliation");
  await checkPreparedFiles(root, ctx);
  let current = ctx;
  for (const module of current.submoduleCommits ?? []) {
    if (!module.commit)
      throw Error(`Missing submodule commit receipt: ${module.path}`);
    await owned(root, token);
    await reconcileSelectedIndex(
      join(root, module.path),
      module.paths,
      module.indexBefore,
      module.commit,
    );
    await rm(moduleIndex(root, ctx.run, module.path), { force: true });
    current = {
      ...current,
      submoduleCommits: current.submoduleCommits?.map((plan) =>
        plan.path === module.path ? { ...plan, indexReconciled: true } : plan,
      ),
    };
    await save(root, current);
  }
  await owned(root, token);
  await reconcileSelectedIndex(
    root,
    parentCommitPaths(ctx.paths, ctx.submoduleCommits ?? []),
    ctx.indexBefore,
    ctx.commit,
  );
  await rm(join(root, `.voidra/local/commit-index-${ctx.run}`), {
    force: true,
  });
  const { lockRaw } = await owned(root, token);
  await save(root, { ...current, indexReconciled: true }, [
    {
      path: ".voidra/local/run.lock",
      expectedHash: hash(lockRaw),
      content: null,
    },
  ]);
}
export async function finalizeResult(
  root: string,
  token: string,
  options: RunOptions = {},
): Promise<void> {
  const { ctx } = await owned(root, token);
  if (!["committed", "finalized"].includes(ctx.phase) || !ctx.commit)
    throw new Error("Commit reconciliation is required first");
  if (ctx.phase === "finalized") {
    await reconcileIndex(root, ctx, token);
    return;
  }
  await checkPreparedFiles(root, ctx);
  if (ctx.release) return finalizeRelease(root, ctx, token, options);
  await options.checkpoint?.("before-finalize");
  await owned(root, token);
  const { action, actionRaw, runRaw } = await current(root, ctx);
  const finalAction = serializeRecord(parseRecord(ctx.actionPath, actionRaw), {
    ...action,
    commits: [...new Set([...(action.commits ?? []), ctx.commit])],
  }).toString();
  const finalRun = serializeRecord(parseRecord(ctx.runPath, runRaw), {
    ...parseRecord(ctx.runPath, runRaw).data,
    commit: ctx.commit,
    ...(ctx.submoduleCommits?.length
      ? {
          submoduleCommits: ctx.submoduleCommits.map((module) => ({
            path: module.path,
            commit: module.commit,
          })),
        }
      : {}),
  }).toString();
  const final = {
    ...ctx,
    phase: "finalized" as const,
    actionHash: hash(finalAction),
    runHash: hash(finalRun),
    fileHashes: {
      ...ctx.fileHashes,
      [ctx.actionPath]: hash(finalAction),
      [ctx.runPath]: hash(finalRun),
    },
    indexReconciled: false,
  };
  await save(root, final, [
    {
      path: ctx.actionPath,
      expectedHash: hash(actionRaw),
      content: finalAction,
    },
    { path: ctx.runPath, expectedHash: hash(runRaw), content: finalRun },
  ]);
  await options.checkpoint?.("after-finalize");
  await reconcileIndex(root, final, token);
}
async function endWithoutCommit(
  root: string,
  token: string,
  summary: string,
  phase: "unsupported" | "failed" | "interrupted",
): Promise<void> {
  const { ctx, lockRaw } = await owned(root, token),
    { action, actionRaw, runRaw } = await current(root, ctx);
  const outcome =
    phase === "unsupported"
      ? "waiting"
      : phase === "failed"
        ? "failed"
        : "interrupted";
  await save(root, { ...ctx, phase }, [
    {
      path: ctx.actionPath,
      expectedHash: hash(actionRaw),
      content: serializeRecord(parseRecord(ctx.actionPath, actionRaw), {
        ...action,
        status: "failed",
        stage: schemas.run.parse(parseRecord(ctx.runPath, runRaw).data)
          .fromStage,
      }).toString(),
    },
    {
      path: ctx.runPath,
      expectedHash: hash(runRaw),
      content: serializeRecord(
        parseRecord(ctx.runPath, runRaw),
        {
          ...parseRecord(ctx.runPath, runRaw).data,
          outcome,
          toStage: schemas.run.parse(parseRecord(ctx.runPath, runRaw).data)
            .fromStage,
          endedAt: new Date().toISOString(),
        },
        `${summary}\n`,
      ).toString(),
    },
    {
      path: ".voidra/local/run.lock",
      expectedHash: hash(lockRaw),
      content: null,
    },
  ]);
}
export async function failRun(
  root: string,
  token: string,
  summary: string,
): Promise<void> {
  const { ctx } = await owned(root, token);
  if (
    ["commit-pending", "committed", "finalized"].includes(ctx.phase) &&
    ctx.submoduleCommits?.length
  )
    throw Error(
      "Submodule commit intent must be recovered before abandoning this run; preserve the checkpoint and stop the owner",
    );
  await endWithoutCommit(root, token, summary, "failed");
}
export async function recoverRun(
  root: string,
  run: string,
  options: RunOptions = {},
): Promise<RunContext> {
  let ctx = await runContext(root, run);
  const project = await checkProject(root),
    pending = [...project.records.values()].filter(
      (record) =>
        record.kind === "operation" &&
        record.document.data.state === "prepared" &&
        schemas.operation
          .parse(record.document.data)
          .changes.some((change) => change.path === checkpointPath(run)),
    );
  if (pending.length) {
    const raw = await text(root, ".voidra/local/run.lock"),
      lock = raw ? schemas.lock.parse(JSON.parse(raw)) : null;
    if (
      lock &&
      (lock.run !== run ||
        lock.action !== ctx.action ||
        !(await inspectLock(lock)).recoverable)
    )
      throw new Error("Run owner is active or belongs to another operation");
    if (
      !lock &&
      ctx.ownerPid &&
      ctx.ownerHost === hostname() &&
      (await processIdentity(ctx.ownerPid)) === ctx.ownerProcessStartedAt
    )
      throw new Error(
        "The original owner is still alive; wait before recovery",
      );
    for (const record of pending)
      await recoverOperation(
        root,
        schemas.operation.parse(record.document.data).id,
      );
    ctx = await runContext(root, run);
  }
  if (
    (ctx.phase === "finalized" && ctx.indexReconciled) ||
    ["unsupported", "failed", "interrupted"].includes(ctx.phase)
  )
    return ctx;
  const raw = await text(root, ".voidra/local/run.lock"),
    lock = raw ? schemas.lock.parse(JSON.parse(raw)) : null;
  if (
    lock &&
    (!(await inspectLock(lock)).recoverable ||
      lock.ownerToken !== ctx.ownerToken)
  )
    throw new Error("Run owner is active, alive or cannot be verified");
  if (
    !lock &&
    ctx.ownerPid &&
    ctx.ownerHost === hostname() &&
    (await processIdentity(ctx.ownerPid)) === ctx.ownerProcessStartedAt
  )
    throw new Error("The original owner is still alive; wait before recovery");
  const identity = await processIdentity(process.pid);
  if (!identity) throw new Error("Recovery owner is missing");
  const ownerToken = randomUUID();
  ctx = {
    ...ctx,
    ownerToken,
    ownerPid: process.pid,
    ownerProcessStartedAt: identity,
    ownerHost: hostname(),
  };
  await save(root, ctx, [
    {
      path: ".voidra/local/run.lock",
      expectedHash: raw === null ? null : hash(raw),
      content: JSON.stringify({
        ...lock,
        ownerToken,
        pid: process.pid,
        processStartedAt: identity,
        host: hostname(),
        agent: ctx.agent,
        run: ctx.run,
        action: ctx.action,
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
      }),
    },
  ]);
  await options.checkpoint?.("recovery-owned");
  if (ctx.phase === "finalized") {
    await reconcileIndex(root, ctx, ctx.ownerToken);
    return runContext(root, run);
  }
  const existing = await findCommit(root, ctx);
  if (existing) {
    await checkPreparedFiles(root, ctx);
    await save(root, { ...ctx, phase: "committed", commit: existing });
    await finalizeResult(root, ctx.ownerToken);
  } else if (
    (ctx.release ||
      (ctx.phase === "commit-pending" && ctx.submoduleCommits?.length)) &&
    ctx.message &&
    ["prepared", "commit-pending"].includes(ctx.phase)
  ) {
    await commitResult(root, ctx.ownerToken, ctx.message, options);
    await finalizeResult(root, ctx.ownerToken, options);
  } else {
    await endWithoutCommit(
      root,
      ctx.ownerToken,
      "The run stopped before a commit. Review the working files before queueing rework.",
      "interrupted",
    );
  }
  return runContext(root, run);
}

export async function listRunContexts(root: string): Promise<RunContext[]> {
  await assertUnlinked(root, ".voidra/local/run-checkpoints");
  const directory = join(root, ".voidra/local/run-checkpoints");
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    },
  );
  const values: RunContext[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    values.push(await runContext(root, entry.name.slice(0, -5)));
  }
  return values;
}

export async function publishPlanning(
  root: string,
  token: string,
  raw: unknown,
): Promise<RunContext> {
  const input = architectureProposalSchema.parse(raw),
    { ctx, lockRaw } = await inspectOwnedRun(root, token);
  if (ctx.phase !== "started" || input.action !== ctx.action)
    throw new Error("Planning report does not match the active action");
  if (ctx.taskRunKind && ctx.taskRunKind !== "planning")
    throw Error("Return this task to Planning before publishing a new plan");
  await unchangedPlanningGit(root, ctx);
  const source = await snapshotSources(root),
    changesOutside = sourceChanges(ctx.sourceSnapshot ?? {}, source).filter(
      (path) => path !== "GLOSSARY.md",
    );
  if (
    (ctx.mode === "plan" ||
      ctx.taskRunKind === "planning" ||
      ["discovery", "plan"].includes(
        schemas.action.parse(
          parseRecord(
            ctx.actionPath,
            (await text(root, ctx.actionPath)) as string,
          ).data,
        ).stage ?? "",
      )) &&
    changesOutside.length
  )
    throw new Error(
      "Planning changed non-planning files; preserve them and stop",
    );
  const result = await proposeArchitecture(root, input, token, true),
    changes = result.changes;
  const actionRaw = changes?.find((c) => c.path === ctx.actionPath)?.content,
    runRaw = await text(root, ctx.runPath);
  if (!changes || !actionRaw || !runRaw || hash(runRaw) !== ctx.runHash)
    throw new Error("Planning files changed outside the run");
  const action = schemas.action.parse(
    parseRecord(ctx.actionPath, actionRaw).data,
  );
  const run = serializeRecord(
    parseRecord(ctx.runPath, runRaw),
    {
      ...parseRecord(ctx.runPath, runRaw).data,
      outcome: "waiting",
      endedAt: new Date().toISOString(),
      toStage: action.stage,
      ...(action.type === "release"
        ? {
            consumedRecords: [
              ...new Set([
                ...schemas.run.parse(parseRecord(ctx.runPath, runRaw).data)
                  .consumedRecords,
                ...(action.releaseActions ?? []),
                ...(action.releaseVersion
                  ? [`.voidra/releases/${action.releaseVersion}.md`]
                  : []),
              ]),
            ],
          }
        : {}),
      planningOnly: changesOutside.length === 0,
    },
    input.summary ?? `Planning stopped at ${result.gate}.\n`,
  ).toString();
  const final: RunContext = {
    ...ctx,
    phase: "finalized",
    indexReconciled: true,
    actionHash: hash(actionRaw),
    runHash: hash(run),
    paths: [],
    fileHashes: Object.fromEntries(
      Object.entries(result.hashes).filter(
        ([path]) => path !== ".voidra/local/run.lock",
      ),
    ),
  };
  for (const path of sourceChanges(ctx.sourceSnapshot ?? {}, source))
    final.fileHashes[path] = source[path] ?? null;
  await save(
    root,
    final,
    [
      ...changes.filter((c) => c.path !== ".voidra/local/run.lock"),
      { path: ctx.runPath, expectedHash: hash(runRaw), content: run },
      {
        path: ".voidra/local/run.lock",
        expectedHash: hash(lockRaw),
        content: null,
      },
    ],
    Boolean(input.glossary),
  );
  return runContext(root, ctx.run);
}

async function snapshotSources(
  root: string,
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const walk = async (path: string) => {
    if (
      path === ".voidra" ||
      path
        .split("/")
        .some((part) =>
          [".git", "node_modules", ".agent-verification"].includes(part),
        ) ||
      /(?:^|\/)(?:\.agents|\.claude)\/skills(?:\/|$)/.test(path) ||
      /(?:^|\/)\.voidra\/local(?:\/|$)/.test(path)
    )
      return;
    const info = await lstat(join(root, path));
    if (info.isDirectory())
      for (const name of await readdir(join(root, path)))
        await walk(path ? `${path}/${name}` : name);
    else result[path] = await fileHash(root, path);
  };
  for (const name of await readdir(root)) await walk(name);
  return result;
}
function sourceChanges(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (path) => before[path] !== after[path],
  );
}
export async function guardRun(
  root: string,
  token: string,
  paths: string[] = [],
  initializingBootstrap = false,
): Promise<void> {
  const { ctx } = await owned(root, token),
    { action } = await current(root, ctx),
    project = await checkProject(root),
    rules = projectLifecycles(project.metadata),
    plan = readPlan(project.files, action.id, project.records);
  if (
    ctx.mode === "plan" ||
    ctx.taskRunKind === "planning" ||
    ctx.taskRunKind === "quality"
  )
    throw new Error(
      "Planning-only and QA runs cannot edit implementation files",
    );
  const repository = await repositoryRoot(root);
  if (
    repository !==
      (ctx.gitRoot === undefined ? await realpath(root) : ctx.gitRoot) &&
    !(initializingBootstrap && ctx.bootstrapGit && repository === null)
  )
    throw new Error("Git repository changed outside this run");
  const release =
    action.type === "release" && action.stage === "review"
      ? releaseIntent(action, plan?.revision)
      : undefined;
  if (
    release &&
    (ctx.planRevision !== plan?.revision ||
      paths.some((path) => !action.releaseFiles?.includes(path)))
  )
    throw new Error(
      "Release scope changed; obtain fresh acceptance before editing",
    );
  if (!release && !["implement", "verify"].includes(action.stage ?? ""))
    throw new Error("This stage cannot edit code");
  if (
    (rules[action.type].planGate || ctx.bootstrapGit) &&
    (!plan ||
      !action.planApproval ||
      Object.entries(plan.hashes).some(
        ([name, value]) =>
          action.planApproval?.hashes[name as keyof typeof plan.hashes] !==
          value,
      ) ||
      (ctx.planRevision && ctx.planRevision !== plan.revision))
  )
    throw new Error(
      "Plan changed; stop and obtain fresh approval before any code work",
    );
  await assertSubmodules(root, ctx.submodules);
  for (const path of paths) {
    await safeGitPath(root, path);
    assertSubmoduleEdit(path, ctx.submodules ?? {});
    if (path.includes("/.voidra/"))
      throw Error(
        "Do not edit a submodule's planning files from its parent task",
      );
    const info = await lstat(join(root, path)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (info?.isDirectory())
      throw Error("List exact implementation files, not directories");
    let ancestor = dirname(path);
    while (ancestor !== ".") {
      const marker = await lstat(join(root, ancestor, ".git")).catch(
        (error) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        },
      );
      if (marker && !Object.hasOwn(ctx.submodules ?? {}, ancestor))
        throw Error(
          `Register the embedded repository as a submodule before editing: ${ancestor}`,
        );
      ancestor = dirname(ancestor);
    }
    if (
      Object.keys(ctx.startingChanges ?? {}).some(
        (existing) => path === existing || path.startsWith(`${existing}/`),
      ) &&
      !Object.hasOwn(ctx.priorWork ?? {}, path)
    )
      throw new Error(
        `Pre-existing user edits overlap ${path}; preserve them and stop`,
      );
  }
  for (const [path, value] of Object.entries(ctx.inputHashes ?? {})) {
    if (
      path.endsWith("/requirements.md") ||
      path.endsWith("/blueprint.md") ||
      path.endsWith("/acceptance.md")
    )
      continue;
    if (hash(project.files.get(path) ?? "") !== value)
      throw new Error(`Consumed record changed: ${path}`);
  }
  for (const [path, value] of Object.entries(ctx.bootstrapFiles ?? {})) {
    if (hash(project.files.get(path) ?? "") !== value)
      throw new Error(`Bootstrap planning baseline changed: ${path}`);
  }
}

const researchReportSchema = z.strictObject({
  findings: z.string().min(1),
  recommendation: z.string().min(1),
  ideas: z.array(
    z.strictObject({
      title: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
});
const humanReportSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
});
async function assertPlanningEffects(
  root: string,
  ctx: RunContext,
): Promise<void> {
  await unchangedPlanningGit(root, ctx);
  if (
    sourceChanges(ctx.sourceSnapshot ?? {}, await snapshotSources(root)).length
  )
    throw new Error(
      "Planning changed repository files; preserve them and stop",
    );
}
async function finishAtGate(
  root: string,
  token: string,
  action: Action,
  summary: string,
  extra: Parameters<typeof applyOperation>[1]["changes"] = [],
): Promise<void> {
  const { ctx, lockRaw } = await owned(root, token),
    { actionRaw, runRaw } = await current(root, ctx);
  if (ctx.phase !== "started") throw new Error("Run is already finished");
  const actionBytes = serializeRecord(
    parseRecord(ctx.actionPath, actionRaw),
    action,
  ).toString();
  const runBytes = serializeRecord(
    parseRecord(ctx.runPath, runRaw),
    {
      ...parseRecord(ctx.runPath, runRaw).data,
      outcome: "waiting",
      endedAt: new Date().toISOString(),
      toStage: action.stage,
      planningOnly:
        sourceChanges(ctx.sourceSnapshot ?? {}, await snapshotSources(root))
          .length === 0,
    },
    summary,
  ).toString();
  await save(
    root,
    {
      ...ctx,
      phase: "finalized",
      indexReconciled: true,
      actionHash: hash(actionBytes),
      runHash: hash(runBytes),
      paths: [],
      fileHashes: {
        ...Object.fromEntries(
          extra.map((c) => [
            c.path,
            c.content === null ? null : hash(c.content),
          ]),
        ),
        ...Object.fromEntries(
          await Promise.all(
            sourceChanges(
              ctx.sourceSnapshot ?? {},
              await snapshotSources(root),
            ).map(async (path) => [path, await fileHash(root, path)]),
          ),
        ),
      },
    },
    [
      ...extra,
      {
        path: ctx.actionPath,
        expectedHash: hash(actionRaw),
        content: actionBytes,
      },
      { path: ctx.runPath, expectedHash: hash(runRaw), content: runBytes },
      {
        path: ".voidra/local/run.lock",
        expectedHash: hash(lockRaw),
        content: null,
      },
    ],
  );
}
export async function publishResearch(
  root: string,
  token: string,
  raw: unknown,
): Promise<void> {
  const input = researchReportSchema.parse(raw),
    { ctx } = await inspectOwnedRun(root, token),
    { action } = await current(root, ctx);
  if (ctx.taskRunKind === "planning" || ctx.taskRunKind === "quality")
    throw Error(
      "Plan Research in Planning, then move TODO to In progress for findings",
    );
  if (action.type !== "research" || action.stage !== "discovery")
    throw new Error("Findings require Research Discovery");
  await assertPlanningEffects(root, ctx);
  const project = await checkProject(root),
    qPath = `.voidra/actions/${action.id}/questions.md`;
  const q = project.records.get(qPath)?.document;
  if (
    q &&
    schemas.questions
      .parse(q.data)
      .rounds.some((r) =>
        r.questions.some(
          (q) =>
            !q.answer || (q.answer.kind === "agent-decides" && !q.agentChoice),
        ),
      )
  )
    throw new Error("Resolve open questions before publishing findings");
  const ids = new Set(
    [...project.records.values()].map((r) => String(r.document.data.id)),
  );
  const changes: Parameters<typeof applyOperation>[1]["changes"] = [];
  const proposed: string[] = [];
  for (const idea of input.ideas) {
    const id = createId("idea", ids);
    ids.add(id);
    proposed.push(id);
    const path = `.voidra/backlog/${id}.md`;
    changes.push({
      path,
      expectedHash: null,
      content: serializeRecord(
        parseRecord(path, "---\n{}\n---\n"),
        {
          id,
          title: idea.title,
          status: "new",
          ...(await newTaskFields(root, project, "idea")),
          createdBy: ctx.agent,
          createdAt: new Date().toISOString(),
        },
        idea.description,
      ).toString(),
    });
  }
  if (q)
    changes.push({ path: qPath, expectedHash: hash(q.raw), content: q.raw });
  const next = transition(
    action,
    "advance",
    {},
    projectLifecycles(project.metadata),
  ).action;
  await finishAtGate(
    root,
    token,
    next,
    `## Findings\n${input.findings}\n\n## Recommendation\n${input.recommendation}\n\n## Proposed ideas\n${proposed.map((id) => `- ${id}`).join("\n") || "None."}\n`,
    changes,
  );
}
export async function publishHumanBlocker(
  root: string,
  token: string,
  raw: unknown,
): Promise<string> {
  const input = humanReportSchema.parse(raw),
    { ctx } = await inspectOwnedRun(root, token),
    { action } = await current(root, ctx),
    project = await checkProject(root);
  const id = createId(
      "act",
      new Set(
        [...project.records.values()].map((r) => String(r.document.data.id)),
      ),
    ),
    path = `.voidra/actions/${id}/action.md`;
  if (ctx.mode === "plan" || ["discovery", "plan"].includes(action.stage ?? ""))
    await assertPlanningEffects(root, ctx);
  const human = schemas.action.parse({
    ...(await newTaskFields(root, project, "action", {}, false)),
    id,
    type: "docs",
    title: input.title,
    doneBy: "you",
    status: "ready",
    createdBy: ctx.agent,
    createdAt: new Date().toISOString(),
    steps: input.steps.map((title, i) => ({
      id: `step-${i + 1}`,
      title,
      done: false,
    })),
  });
  await finishAtGate(
    root,
    token,
    {
      ...action,
      status: "ready",
      blockedBy: [...new Set([...(action.blockedBy ?? []), id])],
    },
    `Waiting for human action ${id}: ${input.title}\n`,
    [
      {
        path,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(path, "---\n{}\n---\n"),
          human,
          input.description,
        ).toString(),
      },
    ],
  );
  return id;
}
export async function resolveDelegatedChoices(
  root: string,
  token: string,
  raw: unknown,
): Promise<void> {
  const input = z
    .array(
      z.strictObject({
        question: z.string(),
        choice: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .min(1)
    .parse(raw);
  const { ctx } = await inspectOwnedRun(root, token),
    project = await checkProject(root),
    path = `.voidra/actions/${ctx.action}/questions.md`,
    doc = project.records.get(path)?.document;
  if (!doc || ctx.phase !== "started")
    throw new Error("No active question round");
  const questions = schemas.questions.parse(doc.data);
  for (const choice of input) {
    const q = questions.rounds
      .flatMap((r) => r.questions)
      .find((q) => q.id === choice.question);
    if (q?.answer?.kind !== "agent-decides" || q.agentChoice)
      throw new Error("Only unresolved delegated choices may be resolved");
    if (!q.options.some((o) => o.label === choice.choice))
      throw new Error("Unknown option");
    q.agentChoice = {
      choice: choice.choice,
      reason: choice.reason,
      by: ctx.agent,
      at: new Date().toISOString(),
    };
  }
  const bytes = serializeRecord(doc, questions).toString();
  await save(
    root,
    { ...ctx, inputHashes: { ...ctx.inputHashes, [path]: hash(bytes) } },
    [{ path, expectedHash: hash(doc.raw), content: bytes }],
  );
}

/** QA is an owned, read-only source pass. Only its bound evidence can automatically complete a workflow task. */
export async function publishQuality(
  root: string,
  token: string,
  raw: unknown,
): Promise<void> {
  const report = qualityReportSchema.parse(raw),
    { ctx, lockRaw } = await owned(root, token);
  if (
    ctx.phase !== "started" ||
    ctx.taskRunKind !== "quality" ||
    ctx.mode === "plan"
  )
    throw Error("An owned QA/security run is required");
  const { action, actionRaw, runRaw } = await current(root, ctx);
  if (
    action.taskWorkflow !== 1 ||
    action.stage !== "review" ||
    action.type === "release"
  )
    throw Error("This task is not awaiting QA/security");
  await unchangedPlanningGit(root, ctx);
  if (
    sourceChanges(ctx.sourceSnapshot ?? {}, await snapshotSources(root)).length
  )
    throw Error("Source changed during QA; preserve it and stop");
  const project = await checkProject(root);
  for (const [path, expected] of Object.entries(ctx.inputHashes ?? {}))
    if (hash(project.files.get(path) ?? Buffer.alloc(0)) !== expected)
      throw Error("QA context changed; run it again against current inputs");
  const prior = [...project.records.values()].find(
    (record) =>
      record.kind === "run" &&
      record.document.data.action === ctx.action &&
      record.document.data.toStage === "review" &&
      (record.document.data.commit ||
        (action.type === "research" &&
          record.document.data.planningOnly === true)) &&
      record.document.data.endedAt,
  );
  if (!prior)
    throw Error("QA requires a completed implementation or Research result");
  if (prior.document.data.commit)
    await git(root, [
      "cat-file",
      "-e",
      `${String(prior.document.data.commit)}^{commit}`,
    ]);
  const checks = [...report.qa.checks, ...report.security.checks];
  if (report.questions?.length && report.decision !== "questions")
    throw Error(
      "Unresolved requirements must return to Planning through a questions result",
    );
  if (report.decision === "pass" && checks.some((check) => !check.passed))
    throw Error("Failed QA/security checks cannot complete a task");
  if (report.decision === "rework" && checks.every((check) => check.passed))
    throw Error("Record the failed check before returning work to TODO");
  if (report.decision === "questions" && !report.questions?.length)
    throw Error("Record the missing requirements as questions");
  const at = new Date().toISOString(),
    by = ctx.agent,
    revision = reviewRevision(project, action.id);
  const plan = readPlan(project.files, action.id, project.records);
  const next = transition(
    action,
    report.decision === "pass" ? "accept-review" : "reject-review",
    {
      revision,
      reviewRevision: revision,
      by,
      at,
      ...(plan ? { plan } : {}),
    },
    projectLifecycles(project.metadata),
  ).action;
  if (report.decision === "pass") next.qualityRun = ctx.run;
  else delete next.qualityRun;
  next.reviewHistory = [
    ...(Array.isArray(action.reviewHistory) ? action.reviewHistory : []),
    ...(action.reviewDecision ? [action.reviewDecision] : []),
    { ...report, run: ctx.run, revision, sourceCommit: ctx.baseCommit, by, at },
  ];
  if (next.reviewDecision && report.decision !== "pass")
    next.reviewDecision.feedback = report.summary;
  next.taskColumn =
    report.decision === "questions"
      ? "planning"
      : report.decision === "rework"
        ? "todo"
        : "review";
  const changes: Parameters<typeof applyOperation>[1]["changes"] = [];
  if (report.decision === "questions") {
    const path = `.voidra/actions/${ctx.action}/questions.md`,
      old = project.records.get(path)?.document;
    const questions = old
      ? schemas.questions.parse(old.data)
      : { action: ctx.action, rounds: [] };
    if (
      questions.rounds.some((round) =>
        round.questions.some(
          (q) =>
            !q.answer || (q.answer.kind === "agent-decides" && !q.agentChoice),
        ),
      )
    )
      throw Error("Resolve the current question round before adding another");
    const round = {
      round: Math.max(0, ...questions.rounds.map((r) => r.round)) + 1,
      askedAt: at,
      questions:
        report.questions?.map((q) => {
          if (q.options.filter((option) => option.recommended).length !== 1)
            throw Error("Each question needs one recommended option");
          return { ...q, id: createId("q"), allowFreeText: true };
        }) ?? [],
    };
    questions.rounds.push(round);
    changes.push({
      path,
      expectedHash: old ? hash(old.raw) : null,
      content: serializeRecord(
        old ?? parseRecord(path, "---\n{}\n---\n"),
        questions,
      ).toString(),
    });
    next.stage = projectLifecycles(project.metadata)[next.type].stages.includes(
      "discovery",
    )
      ? "discovery"
      : projectLifecycles(project.metadata)[next.type].planGate
        ? "plan"
        : "implement";
    next.status = "waiting";
    if (next.planApproval)
      next.approvalHistory = [
        ...(next.approvalHistory ?? []),
        next.planApproval,
      ];
    delete next.planApproval;
    next.workflowPlanned = false;
  }
  const finalAction = serializeRecord(
    parseRecord(ctx.actionPath, actionRaw),
    next,
  ).toString();
  const finalRun = serializeRecord(
    parseRecord(ctx.runPath, runRaw),
    {
      ...parseRecord(ctx.runPath, runRaw).data,
      outcome: report.decision === "pass" ? "advanced" : "waiting",
      endedAt: at,
      toStage: next.stage,
      checks: checks.map(({ name, passed }) => ({ name, passed })),
      quality: report,
      sourceCommit: ctx.baseCommit ?? undefined,
      planningOnly: true,
    },
    `## QA and security review\n${report.summary}\n\n## QA\n${report.qa.summary}\n${report.qa.checks.map((check) => `- ${check.passed ? "Pass" : "Fail"}: ${check.name} — ${check.evidence}`).join("\n")}\n\n## Security\n${report.security.summary}\n${report.security.checks.map((check) => `- ${check.passed ? "Pass" : "Fail"}: ${check.name} — ${check.evidence}`).join("\n")}`,
  ).toString();
  await save(
    root,
    {
      ...ctx,
      phase: "finalized",
      indexReconciled: true,
      actionHash: hash(finalAction),
      runHash: hash(finalRun),
      paths: [],
      fileHashes: {
        [ctx.actionPath]: hash(finalAction),
        [ctx.runPath]: hash(finalRun),
      },
    },
    [
      ...changes,
      {
        path: ctx.actionPath,
        expectedHash: hash(actionRaw),
        content: finalAction,
      },
      { path: ctx.runPath, expectedHash: hash(runRaw), content: finalRun },
      {
        path: ".voidra/local/run.lock",
        expectedHash: hash(lockRaw),
        content: null,
      },
    ],
  );
}
