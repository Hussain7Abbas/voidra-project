import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, realpath, rm } from "node:fs/promises";
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
  schemas,
  serializeRecord,
  transition,
} from "voidra";
import { z } from "zod";
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
  await applyOperation(root, {
    changes: [
      ...changes,
      {
        path,
        expectedHash: old === null ? null : hash(old),
        content: `${JSON.stringify(checkpointSchema.parse(ctx), null, 2)}\n`,
      },
    ],
  });
}
async function current(
  root: string,
  ctx: RunContext,
): Promise<{ action: Action; actionRaw: string; runRaw: string }> {
  const checked = await checkProject(root);
  if (checked.diagnostics.length)
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
export async function startRun(
  root: string,
  agent: RunContext["agent"],
  ownerPid = process.pid,
): Promise<RunContext | null> {
  const checked = await checkProject(root);
  if (checked.diagnostics.length)
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
    ["review", "done", "released", "cancelled"].includes(action.stage ?? "")
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
    outcome: "running",
    consumedRecords: [actionId, queuePath, ...(action.blockedBy ?? [])],
  });
  const actionRaw = serializeRecord(doc, {
      ...action,
      status: "running",
    }).toString(),
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
    phase: "started",
    baseCommit: await head(root),
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
    ...(action.blockedBy ?? []).map((id) => {
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
      content: JSON.stringify(lock),
    },
  ]);
  if (action.type !== "docs" || action.stage !== "implement") {
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
  const { action, actionRaw, runRaw } = await current(root, ctx);
  const next = transition(action, "advance", {}).action;
  if (next.stage !== "review")
    throw new Error("This runtime only prepares Docs/chore Review");
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
    },
    `${report.summary}\n`,
  ).toString();
  const preparedAction = serializeRecord(
    parseRecord(ctx.actionPath, actionRaw),
    next,
  ).toString();
  const paths = [...new Set([...report.paths, ctx.actionPath, ctx.runPath])];
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
