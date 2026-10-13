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
  type Action,
  actionComplete,
  applyOperation,
  checkProject,
  createId,
  hash,
  parseRecord,
  projectLifecycles,
  readPlan,
  schemas,
  serializeRecord,
  transition,
} from "voidra";
import { z } from "zod";
import {
  architectureProposalSchema,
  proposeArchitecture,
} from "./architecture.ts";
import { inspectLock, processIdentity } from "./lock.ts";

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
  sourceSnapshot: z.record(z.string(), z.string().nullable()).optional(),
  inputHashes: z.record(z.string(), z.string()).optional(),
  priorWork: z.record(z.string(), z.string().nullable()).optional(),
  baseTags: z.string().optional(),
  planRevision: z.string().optional(),
  startingChanges: z.record(z.string(), z.string().nullable()).optional(),
  paths: z.array(z.string()),
  fileHashes: z.record(z.string(), z.string().nullable()),
  commit: z.string().optional(),
  message: z.string().optional(),
  indexBefore: z.string().optional(),
  indexReconciled: z.boolean().optional(),
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
};
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
      !path.startsWith(`.voidra/actions/${ctx.action}/`)
    )
      throw new Error("Run checkpoint contains another action's files");
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
    {
      changes: [
        ...changes,
        {
          path,
          expectedHash: old === null ? null : hash(old),
          content: `${JSON.stringify(checkpointSchema.parse(ctx), null, 2)}\n`,
        },
      ],
    },
    { allowGlossary },
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
  const queuePath = ".voidra/local/pending-actions.md",
    queue = checked.records.get(queuePath)?.document;
  if (!queue) return null;
  const ids = Array.from(
      queue.body.matchAll(/act-[0-9a-hjkmnp-tv-z]{6}/g),
      (m) => m[0],
    ),
    actionId = ids[0];
  if (!actionId) return null;
  const actionPath = `.voidra/actions/${actionId}/action.md`,
    doc = checked.records.get(actionPath)?.document;
  if (!doc) throw new Error("Queued action not found");
  const action = schemas.action.parse(doc.data);
  if (action.type === "profile-change" && action.status === "draft")
    throw new Error("Review the Profile change draft before queueing it");
  if (
    action.doneBy !== "agent" ||
    !["ready", "draft", "failed"].includes(action.status) ||
    ["done", "released", "cancelled"].includes(action.stage ?? "")
  )
    throw new Error("Queued action is at a gate or already running");
  for (const dependency of action.blockedBy ?? []) {
    const other = checked.records.get(`.voidra/actions/${dependency}/action.md`)
      ?.document.data;
    if (!other || !actionComplete(schemas.action.parse(other)))
      throw new Error("Queued action is blocked");
  }
  if (
    [...checked.records.values()].some(
      (r) =>
        r.kind === "action" &&
        r.document.data.parent === actionId &&
        !actionComplete(schemas.action.parse(r.document.data)),
    )
  )
    throw new Error("Queued parent is blocked by unfinished child slices");
  const identity = await processIdentity(ownerPid);
  if (!identity) throw new Error("Run owner process is missing");
  if (
    (await git(root, ["rev-parse", "--is-inside-work-tree"]).catch(
      () => "false",
    )) !== "true"
  )
    throw new Error(
      "The project must be a local Git repository before running",
    );
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
    mode === "plan" && !["discovery", "plan"].includes(action.stage ?? "");
  if (
    action.stage === "review" &&
    action.type !== "release" &&
    !checked.records.get(`.voidra/actions/${action.id}/questions.md`)
  )
    throw new Error("Review needs a human decision");
  let startedAction: Action = { ...action, status: "running" };
  if (stale) startedAction = { ...action, stage: "plan", status: "waiting" };
  else if (boundary) startedAction = action;
  else if (action.stage === "review" && action.type !== "release")
    startedAction = {
      ...action,
      stage: rules[action.type].rejectTo,
      status: "running",
      resumedAfterQuestions: true,
    };
  const sourceSnapshot = await snapshotSources(root);
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
    consumedRecords: [
      ...new Set([
        actionId,
        actionPath,
        ".voidra/voidra.json",
        ...(action.blockedBy ?? []),
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
    priorWork,
    inputHashes: Object.fromEntries(
      [...checked.files]
        .filter(
          ([path]) =>
            path === ".voidra/voidra.json" ||
            path.startsWith(".voidra/profile/") ||
            path.startsWith(".voidra/backlog/") ||
            (path.startsWith(`.voidra/actions/${action.id}/`) &&
              ![actionPath].includes(path) &&
              !path.includes("/runs/")),
        )
        .map(([path, bytes]) => [path, hash(bytes)]),
    ),
    baseTags: await git(root, [
      "for-each-ref",
      "--format=%(refname):%(objectname)",
      "refs/tags",
    ]),
    ...(plan ? { planRevision: plan.revision } : {}),
    baseCommit: await head(root),
    startingChanges: Object.fromEntries(
      await Promise.all(
        [
          ...new Set(
            (
              await Promise.all([
                git(root, ["diff", "--name-only", "-z"]),
                git(root, ["diff", "--cached", "--name-only", "-z"]),
                git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
              ])
            ).flatMap((list) => list.split("\0").filter(Boolean)),
          ),
        ]
          .filter((path) => !path.startsWith(".voidra/"))
          .map(async (path) => [path, await fileHash(root, path)]),
      ),
    ),
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
    {
      path: queuePath,
      expectedHash: hash(queue.raw),
      content: serializeRecord(
        queue,
        queue.data,
        ids
          .slice(1)
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
  if (action.type === "release") {
    await endWithoutCommit(
      root,
      ownerToken,
      `Not supported yet: ${action.type} at ${action.stage}.`,
      "unsupported",
    );
    return runContext(root, run);
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
async function safeGitPath(root: string, path: string): Promise<void> {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.split("/").some((p) => p === ".." || p === ".git") ||
    path.startsWith(".voidra/local/") ||
    path === ".voidra/local"
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
  if (ctx.mode === "plan" || ["research", "release"].includes(action.type))
    throw new Error("This run cannot prepare an implementation commit");
  if (action.type !== "docs" && !report.reviews)
    throw new Error("Both standards and plan review are required");
  if (
    report.reviews &&
    (!report.reviews.standards.passed || !report.reviews.plan.passed)
  )
    throw new Error("Fix both review parts before preparing");
  const rules = projectLifecycles(project.metadata);
  let next = action;
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
        : await fileHash(root, path);
  }
  await save(
    root,
    {
      ...ctx,
      phase: "prepared",
      paths,
      fileHashes,
      actionHash: hash(preparedAction),
      runHash: hash(preparedRun),
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
    if ((await lstat(join(root, path))).isSymbolicLink())
      return hash(`link:${await readlink(join(root, path))}`);
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
  for (const [path, expected] of Object.entries(ctx.fileHashes)) {
    await safeGitPath(root, path);
    if ((await fileHash(root, path)) !== expected)
      throw new Error(`Prepared file changed: ${path}`);
  }
}
export async function commitResult(
  root: string,
  token: string,
  message: string,
  options: RunOptions = {},
): Promise<string> {
  const { ctx } = await owned(root, token);
  if (ctx.mode === "plan") throw new Error("Planning-only runs cannot commit");
  if (/^Voidra-(Action|Run):/m.test(message))
    throw new Error("The runtime owns commit trailers");
  if (!["prepared", "commit-pending", "committed"].includes(ctx.phase))
    throw new Error("Prepare the result before committing");
  const existing = await findCommit(root, ctx);
  if (existing) {
    await checkPreparedFiles(root, ctx);
    await save(root, { ...ctx, phase: "committed", commit: existing });
    return existing;
  }
  await checkPreparedFiles(root, ctx);
  if ((await head(root)) !== ctx.baseCommit)
    throw new Error("Git HEAD changed outside this run");
  const indexBefore = await git(root, [
    "ls-files",
    "--stage",
    "-z",
    "--",
    ...ctx.paths,
  ]);
  if (ctx.indexBefore !== undefined && ctx.indexBefore !== indexBefore)
    throw new Error("Git index changed outside the run");
  const pending = {
    ...ctx,
    phase: "commit-pending" as const,
    message,
    indexBefore,
  };
  await save(root, pending);
  await options.checkpoint?.("before-commit");
  await owned(root, token);
  await checkPreparedFiles(root, pending);
  const index = join(root, `.voidra/local/commit-index-${ctx.run}`),
    env = { GIT_INDEX_FILE: index };
  await git(
    root,
    ["read-tree", ...(ctx.baseCommit ? [ctx.baseCommit] : ["--empty"])],
    env,
  );
  await git(root, ["add", "--", ...ctx.paths], env);
  await git(
    root,
    [
      "commit",
      "-m",
      `${message}\n\nVoidra-Action: ${ctx.action}\nVoidra-Run: ${ctx.run}`,
    ],
    env,
  );
  await options.checkpoint?.("after-commit");
  const commit = await findCommit(root, ctx);
  if (!commit) throw new Error("Commit trailer was not found");
  await save(root, { ...pending, phase: "committed", commit });
  return commit;
}
async function reconcileIndex(
  root: string,
  ctx: RunContext,
  token: string,
): Promise<void> {
  if (!ctx.commit) throw new Error("Missing commit for index reconciliation");
  await checkPreparedFiles(root, ctx);
  if ((await head(root)) !== ctx.commit)
    throw new Error("Git HEAD changed before index reconciliation");
  const staged = await git(root, [
    "ls-files",
    "--stage",
    "-z",
    "--",
    ...ctx.paths,
  ]);
  const tree = await git(root, [
    "ls-tree",
    "-z",
    ctx.commit,
    "--",
    ...ctx.paths,
  ]);
  const after =
    tree
      .split("\0")
      .filter(Boolean)
      .map((row) => row.replace(/^(\d+) \w+ ([a-f0-9]+)\t/, "$1 $2 0\t"))
      .join("\0") + (tree ? "\0" : "");
  if (staged !== ctx.indexBefore && staged !== after)
    throw new Error("Git index changed outside the run; preserved");
  await owned(root, token);
  await git(root, ["reset", "-q", "HEAD", "--", ...ctx.paths]);
  await rm(join(root, `.voidra/local/commit-index-${ctx.run}`), {
    force: true,
  });
  const { lockRaw } = await owned(root, token);
  await save(root, { ...ctx, indexReconciled: true }, [
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
  await endWithoutCommit(root, token, summary, "failed");
}
export async function recoverRun(
  root: string,
  run: string,
  options: RunOptions = {},
): Promise<RunContext> {
  let ctx = await runContext(root, run);
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
  if (
    (await head(root)) !== ctx.baseCommit ||
    (await git(root, [
      "for-each-ref",
      "--format=%(refname):%(objectname)",
      "refs/tags",
    ])) !== ctx.baseTags
  )
    throw new Error("Git HEAD or tags changed during planning");
  const source = await snapshotSources(root),
    changesOutside = sourceChanges(ctx.sourceSnapshot ?? {}, source).filter(
      (path) => path !== "GLOSSARY.md",
    );
  if (
    (ctx.mode === "plan" ||
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
      path === ".git" ||
      path === ".voidra" ||
      path.split("/").includes("node_modules") ||
      path === ".agents/skills" ||
      path === ".claude/skills" ||
      path === ".agent-verification"
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
): Promise<void> {
  const { ctx } = await owned(root, token),
    { action } = await current(root, ctx),
    project = await checkProject(root),
    rules = projectLifecycles(project.metadata),
    plan = readPlan(project.files, action.id, project.records);
  if (ctx.mode === "plan")
    throw new Error("Planning-only runs cannot edit implementation files");
  if (!["implement", "verify"].includes(action.stage ?? ""))
    throw new Error("This stage cannot edit code");
  if (
    rules[action.type].planGate &&
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
  for (const path of paths) {
    await safeGitPath(root, path);
    if (
      Object.hasOwn(ctx.startingChanges ?? {}, path) &&
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
  if (
    (await head(root)) !== ctx.baseCommit ||
    (await git(root, [
      "for-each-ref",
      "--format=%(refname):%(objectname)",
      "refs/tags",
    ])) !== ctx.baseTags
  )
    throw new Error("Git HEAD or tags changed during planning");
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
