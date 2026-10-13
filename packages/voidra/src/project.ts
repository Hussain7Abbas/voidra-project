import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Diagnostic, VoidraError } from "./errors.ts";
import {
  actionComplete,
  approvalCurrent,
  hash,
  type Lifecycles,
  type PlanRevision,
  planFiles,
  planRevision,
  projectLifecycles,
  validateLifecycles,
} from "./lifecycle.ts";
import { fieldLine, parseRecord, type RecordDocument } from "./records.ts";
import {
  type Action,
  type ProjectMetadata,
  plainSchemas,
  type Question,
  type RecordKind,
  schemas,
  validateRecord,
} from "./schemas.ts";
import { FORMAT_VERSION, PACKAGE_VERSION } from "./versions.ts";

export { FORMAT_VERSION, PACKAGE_VERSION } from "./versions.ts";
export type ProjectFiles = Map<string, Buffer>;
export interface CheckedRecord {
  kind: RecordKind;
  document: RecordDocument;
}
export interface ProjectInspection {
  diagnostics: Diagnostic[];
  records: Map<string, CheckedRecord>;
  metadata?: ProjectMetadata;
  files: ProjectFiles;
}
export function diagnosticFingerprint(diagnostic: Diagnostic): string {
  return hash(
    JSON.stringify([
      diagnostic.code,
      diagnostic.file,
      diagnostic.field,
      diagnostic.message,
    ]),
  );
}
/** Unresolved records may coexist with edits to other records; diagnostics remain visible. */
export function deferredConflictDiagnostics(
  project: ProjectInspection,
): Diagnostic[] {
  if (!project.metadata) return [];
  const conflicts = project.diagnostics.filter((d) => d.code === "conflict");
  const ids = new Set(
    conflicts.flatMap((d) => {
      const id =
        /^\.voidra\/actions\/(act-[0-9a-hjkmnp-tv-z]{6})\/action\.md$/.exec(
          d.file,
        )?.[1] ??
        /^\.voidra\/backlog\/(idea-[0-9a-hjkmnp-tv-z]{6})\.md$/.exec(
          d.file,
        )?.[1];
      return id ? [id] : [];
    }),
  );
  const planActions = new Set(
    conflicts.flatMap((d) => {
      const id =
        /^\.voidra\/actions\/(act-[0-9a-hjkmnp-tv-z]{6})\/(requirements|blueprint|acceptance)\.md$/.exec(
          d.file,
        )?.[1];
      return id ? [id] : [];
    }),
  );
  return project.diagnostics.filter(
    (d) =>
      d.code === "conflict" ||
      (d.code === "missing-reference" &&
        ids.has(d.message.replace(/^Record does not exist: /, ""))) ||
      (d.code === "missing-plan" &&
        [...planActions].some(
          (id) => d.file === `.voidra/actions/${id}/action.md`,
        )),
  );
}
export function blockingPlanningDiagnostics(
  project: ProjectInspection,
): Diagnostic[] {
  const deferred = new Set(
    deferredConflictDiagnostics(project).map(diagnosticFingerprint),
  );
  return project.diagnostics.filter(
    (d) =>
      !["stale-approval", "stale-review"].includes(d.code) &&
      !deferred.has(diagnosticFingerprint(d)),
  );
}
export function fileKind(path: string): RecordKind | undefined {
  if (path === ".voidra/voidra.json") return "project";
  if (/^\.voidra\/profile\/[^/]+\.md$/.test(path)) return "profile";
  if (/^\.voidra\/backlog\/[^/]+\.md$/.test(path)) return "idea";
  const kind =
    /^\.voidra\/actions\/[^/]+\/(action|questions|requirements|blueprint|acceptance)\.md$/.exec(
      path,
    )?.[1];
  if (kind) return kind as RecordKind;
  if (/^\.voidra\/actions\/[^/]+\/runs\/[^/]+\.md$/.test(path)) return "run";
  if (/^\.voidra\/releases\/[^/]+\.md$/.test(path)) return "release";
  if (path === ".voidra/local/pending-actions.md") return "queue";
  if (path === ".voidra/local/run.lock") return "lock";
  if (/^\.voidra\/local\/operations\/[^/]+\.json$/.test(path))
    return "operation";
  return undefined;
}
export async function readProjectFiles(
  root: string,
): Promise<{ files: ProjectFiles; diagnostics: Diagnostic[] }> {
  const files: ProjectFiles = new Map();
  const diagnostics: Diagnostic[] = [];
  const walk = async (path: string): Promise<void> => {
    let stat: Awaited<ReturnType<typeof lstat>>;
    try {
      stat = await lstat(join(root, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      diagnostics.push({
        code: "symlink",
        file: path,
        field: "$",
        line: 1,
        message: "Record paths must not be symlinks",
      });
      return;
    }
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort())
        await walk(`${path}/${name}`);
    } else if (
      stat.isFile() &&
      (fileKind(path) ||
        path === ".voidra/README.md" ||
        path === ".voidra/.gitignore" ||
        path === ".voidra/local/release-selection.json" ||
        (path.endsWith(".md") && !path.startsWith(".voidra/local/")))
    )
      files.set(path, await readFile(join(root, path)));
  };
  await walk(".voidra");
  return { files, diagnostics };
}
function planDocument(
  files: ProjectFiles,
  path: string,
  records?: Map<string, CheckedRecord>,
): RecordDocument | undefined {
  if (records) return records.get(path)?.document;
  const raw = files.get(path);
  if (!raw) return undefined;
  try {
    return parseRecord(path, raw);
  } catch {
    return undefined;
  }
}
export function readPlan(
  files: ProjectFiles,
  id: string,
  records?: Map<string, CheckedRecord>,
): PlanRevision | undefined {
  const values: Partial<Record<(typeof planFiles)[number], Buffer>> = {};
  for (const file of planFiles) {
    const path = `.voidra/actions/${id}/${file}`;
    const bytes = files.get(path);
    if (!bytes || (records && !records.has(path))) return undefined;
    values[file] = bytes;
  }
  const plan = planRevision(
      values as Record<(typeof planFiles)[number], Buffer>,
    ),
    actionPath = `.voidra/actions/${id}/action.md`;
  const parsed = schemas.action.safeParse(
      planDocument(files, actionPath, records)?.data,
    ),
    action = parsed.success ? parsed.data : undefined;
  if (action?.type === "release" && action.releaseActions) {
    const version = action.releaseVersion ?? null,
      path = version ? `.voidra/releases/${version}.md` : null;
    const record = path ? planDocument(files, path, records) : undefined;
    // Final status/date are bookkeeping; the approved version, members, tag and notes remain fixed.
    const data = record ? { ...record.data } : null;
    if (data) {
      delete data.status;
      delete data.date;
    }
    return {
      ...plan,
      revision: hash(
        JSON.stringify({
          plan: plan.revision,
          actions: action.releaseActions,
          version,
          tag: action.releaseTag ?? null,
          paths: action.releaseFiles ?? null,
          message: action.releaseMessage ?? null,
          record: record ? { data, body: record.body } : null,
        }),
      ),
    };
  }
  return plan;
}
function minimumNewer(required: string): boolean {
  const current = PACKAGE_VERSION.split(".").map(Number);
  const parts = required.split("-")[0]?.split(".").map(Number) ?? [];
  for (let i = 0; i < 3; i++) {
    if ((parts[i] ?? 0) !== current[i])
      return (parts[i] ?? 0) > (current[i] ?? 0);
  }
  return false;
}
export function inspectFiles(
  files: ProjectFiles,
  options: { lifecycles?: Lifecycles; ignoreOperation?: string } = {},
): ProjectInspection {
  const diagnostics: Diagnostic[] = [];
  const records = new Map<string, CheckedRecord>();
  const result: ProjectInspection = { files, diagnostics, records };
  const add = (
    code: string,
    file: string,
    field: string,
    message: string,
  ): void => {
    diagnostics.push({
      code,
      file,
      field,
      line: records.has(file)
        ? fieldLine(
            (records.get(file) as CheckedRecord).document,
            field.split("."),
          )
        : 1,
      message,
    });
  };
  const parse = (file: string, kind: RecordKind): void => {
    const bytes = files.get(file);
    if (!bytes) return;
    try {
      const document = parseRecord(file, bytes);
      const errors = validateRecord(kind, document);
      diagnostics.push(...errors);
      if (!errors.length) records.set(file, { kind, document });
    } catch (error) {
      if (error instanceof VoidraError) diagnostics.push(error.diagnostic());
      else throw error;
    }
  };
  const metaPath = ".voidra/voidra.json";
  if (!files.has(metaPath)) {
    add(
      "required-file",
      metaPath,
      "$",
      "No Voidra project: missing voidra.json",
    );
    return result;
  }
  parse(metaPath, "project");
  const metaRecord = records.get(metaPath);
  if (!metaRecord) return result;
  const metadata = schemas.project.parse(metaRecord.document.data);
  result.metadata = metadata;
  const minimumParts =
    metadata.requiredVoidra.split("-")[0]?.split(".").map(Number) ?? [];
  const extendedActions =
    (minimumParts[0] ?? 0) > 0 ||
    (minimumParts[1] ?? 0) > 2 ||
    ((minimumParts[1] ?? 0) === 2 &&
      ((minimumParts[2] ?? 0) > 0 || !metadata.requiredVoidra.includes("-")));
  if (
    metadata.format > FORMAT_VERSION ||
    minimumNewer(metadata.requiredVoidra)
  ) {
    add(
      "newer-format",
      metaPath,
      "format",
      `Project needs voidra ≥ ${metadata.requiredVoidra}; this package is ${PACKAGE_VERSION}`,
    );
    return result;
  }
  if (metadata.format < FORMAT_VERSION) {
    add(
      "migration-required",
      metaPath,
      "format",
      `Format ${metadata.format} requires migration to ${FORMAT_VERSION}`,
    );
    return result;
  }
  for (const path of [".voidra/README.md", ".voidra/.gitignore"]) {
    const bytes = files.get(path);
    if (!bytes?.length)
      add(
        "required-file",
        path,
        "$",
        "Required project file is missing or empty",
      );
    else {
      try {
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (/^(<<<<<<< |>>>>>>> )/m.test(raw))
          add("conflict", path, "$", "Unresolved merge conflict");
      } catch {
        add("encoding", path, "$", "Expected valid UTF-8");
      }
    }
  }
  if (
    files.has(".voidra/.gitignore") &&
    !plainSchemas.ignore.safeParse(
      files.get(".voidra/.gitignore")?.toString() ?? "",
    ).success
  )
    add(
      "ignore",
      ".voidra/.gitignore",
      "$",
      "Ignore local/ so personal records stay uncommitted",
    );
  for (const [file] of files) {
    const kind = fileKind(file);
    if (kind && kind !== "project") parse(file, kind);
    else if (
      !kind &&
      file.endsWith(".md") &&
      !file.startsWith(".voidra/local/") &&
      file !== ".voidra/README.md" &&
      /^(<<<<<<< |>>>>>>> )/m.test(files.get(file)?.toString() ?? "")
    )
      add("conflict", file, "$", "Unresolved merge conflict");
  }
  let rules: Lifecycles;
  try {
    const declared = projectLifecycles(metadata);
    rules = options.lifecycles ?? declared;
  } catch (error) {
    if (error instanceof VoidraError) diagnostics.push(error.diagnostic());
    else throw error;
    return result;
  }
  if (
    metadata.lifecycleOverrides &&
    Object.keys(metadata.lifecycleOverrides).length &&
    !extendedActions
  )
    add(
      "minimum-reader",
      metaPath,
      "requiredVoidra",
      "Lifecycle overrides require voidra ≥ 0.2.0",
    );
  for (const message of validateLifecycles(rules))
    add("lifecycle", metaPath, "lifecycles", message);
  if (validateLifecycles(rules).length) return result;
  const actions = new Map<string, { action: Action; file: string }>();
  const ids = new Set<string>([metadata.project.id]);
  const questions = new Map<string, Question[]>();
  const reference = (id: string, file: string, field: string): void => {
    if (!ids.has(id))
      add("missing-reference", file, field, `Record does not exist: ${id}`);
  };
  for (const [file, { kind, document }] of records) {
    const d = document.data;
    if (typeof d.id === "string") {
      if (ids.has(d.id))
        add("duplicate-id", file, "id", `Duplicate ID: ${d.id}`);
      ids.add(d.id);
    }
    if (kind === "action") {
      const action = schemas.action.parse(d);
      actions.set(action.id, { action, file });
      if (file !== `.voidra/actions/${action.id}/action.md`)
        add("identity", file, "id", "Action ID must match its directory");
      if (
        action.doneBy === "agent" &&
        !rules[action.type].stages.includes(action.stage as never) &&
        action.stage !== "cancelled" &&
        action.stage !== "released"
      )
        add(
          "stage",
          file,
          "stage",
          `Stage ${action.stage} is invalid for ${action.type}`,
        );
    }
    if (kind === "idea" && file !== `.voidra/backlog/${d.id}.md`)
      add("identity", file, "id", "Idea ID must match its filename");
    if (kind === "profile" && file !== `.voidra/profile/${d.block}.md`)
      add("identity", file, "block", "Profile block must match its filename");
    if (
      ["questions", "requirements", "blueprint", "acceptance", "run"].includes(
        kind,
      ) &&
      !file.startsWith(`.voidra/actions/${d.action}/`)
    )
      add(
        "identity",
        file,
        "action",
        "Action reference must match its directory",
      );
    if (kind === "run" && !file.endsWith(`-${d.agent}-${d.id}.md`))
      add(
        "identity",
        file,
        "id",
        "Run filename must end with its agent and ID",
      );
    if (kind === "release" && file !== `.voidra/releases/${d.version}.md`)
      add(
        "identity",
        file,
        "version",
        "Release version must match its filename",
      );
    if (
      kind === "operation" &&
      file !== `.voidra/local/operations/${d.id}.json`
    )
      add("identity", file, "id", "Operation ID must match its filename");
    if (kind === "questions") {
      const rounds = schemas.questions.parse(d).rounds;
      const all: Question[] = [];
      const answered = new Set<string>();
      const roundIds = new Set<number>();
      for (const round of rounds) {
        if (roundIds.has(round.round))
          add(
            "duplicate-round",
            file,
            "rounds",
            "Round numbers must be unique",
          );
        roundIds.add(round.round);
        const before = new Set(answered);
        for (const q of round.questions) {
          if (ids.has(q.id))
            add(
              "duplicate-id",
              file,
              "rounds",
              `Duplicate question ID: ${q.id}`,
            );
          ids.add(q.id);
          for (const dep of q.dependsOn ?? [])
            if (!before.has(dep))
              add(
                "question-prerequisite",
                file,
                q.id,
                `Prerequisite ${dep} must be answered in an earlier round`,
              );
          if (
            q.answer?.kind === "choice" &&
            !q.options.some((o) => o.label === q.answer?.choice)
          )
            add(
              "question-answer",
              file,
              q.id,
              "Choice is not an available option",
            );
          if (q.answer?.kind === "text" && !q.allowFreeText)
            add(
              "question-answer",
              file,
              q.id,
              "Free-text answers are disabled",
            );
          if (q.agentChoice && q.answer?.kind !== "agent-decides")
            add(
              "question-answer",
              file,
              q.id,
              "Agent choice requires agent-decides answer",
            );
          if (q.answer) answered.add(q.id);
          all.push(q);
        }
      }
      questions.set(String(d.action), all);
    }
  }
  const releaseClaims = new Map<string, string>();
  for (const [id, { action: a, file }] of actions) {
    if (a.releasedIn) {
      if (!extendedActions)
        add(
          "minimum-reader",
          metaPath,
          "requiredVoidra",
          "Release membership requires voidra ≥ 0.2.0",
        );
      const record = records.get(`.voidra/releases/${a.releasedIn}.md`);
      if (
        record?.kind !== "release" ||
        record.document.data.status !== "released" ||
        !schemas.release.parse(record.document.data).actions.includes(id)
      )
        add(
          "release-membership",
          file,
          "releasedIn",
          "Released membership requires its completed release record",
        );
    }
    if (a.releaseActions) {
      if (!extendedActions)
        add(
          "minimum-reader",
          metaPath,
          "requiredVoidra",
          "Release selections require voidra ≥ 0.2.0",
        );
      for (const member of a.releaseActions) {
        reference(member, file, "releaseActions");
        const selected = actions.get(member)?.action;
        if (
          selected?.type === "release" ||
          (a.stage !== "cancelled" &&
            selected &&
            (!actionComplete(selected) ||
              (a.stage !== "released" && selected.stage === "released")))
        )
          add(
            "release-selection",
            file,
            "releaseActions",
            `${member} must be completed, unreleased work`,
          );
        if (!["cancelled", "released"].includes(a.stage ?? "")) {
          const prior = releaseClaims.get(member);
          if (prior)
            add(
              "release-selection",
              file,
              "releaseActions",
              `${member} is already selected by ${prior}`,
            );
          releaseClaims.set(member, id);
        }
      }
      if (["review", "released"].includes(a.stage ?? "")) {
        const record = a.releaseVersion
          ? records.get(`.voidra/releases/${a.releaseVersion}.md`)
          : undefined;
        if (
          !a.releaseVersion ||
          !a.releaseTag ||
          record?.kind !== "release" ||
          record.document.data.action !== id ||
          JSON.stringify(record.document.data.actions) !==
            JSON.stringify(a.releaseActions) ||
          record.document.data.tag !== a.releaseTag
        )
          add(
            "release-proposal",
            file,
            "releaseVersion",
            "Release review requires a matching version, tag and member proposal record",
          );
      }
    }
    for (const dep of a.blockedBy ?? []) reference(dep, file, "blockedBy");
    if (a.parent) reference(a.parent, file, "parent");
    for (const link of a.links ?? [])
      if (/^(act|idea|q|run|prj)-[0-9a-hjkmnp-tv-z]{6}$/.test(link))
        reference(link, file, "links");
    const open = (questions.get(id) ?? []).some((q) => !q.answer);
    if (open && a.status !== "waiting")
      add("status", file, "status", "Open questions require waiting status");
    if (
      !open &&
      a.doneBy === "agent" &&
      a.status === "waiting" &&
      !(a.stage === "plan" && rules[a.type].planGate) &&
      a.stage !== "review"
    )
      add(
        "status",
        file,
        "status",
        "Waiting action has no pending questions or human gate",
      );
    if (a.doneBy === "agent" && rules[a.type].planGate) {
      const plan = readPlan(files, id, records);
      const children = Array.from(actions.values())
        .map((r) => r.action)
        .filter((child) => child.parent === id);
      const aggregate =
        a.stage === "done" &&
        a.completedBySlices === true &&
        !a.commits?.length &&
        children.length > 0 &&
        children.every(actionComplete) &&
        !planFiles.some((file) => files.has(`.voidra/actions/${id}/${file}`)) &&
        !Array.from(records.values()).some(
          (r) =>
            r.kind === "run" &&
            r.document.data.action === id &&
            ["implement", "verify"].includes(
              String(r.document.data.fromStage),
            ) &&
            r.document.data.planningOnly !== true,
        );
      if (aggregate && !extendedActions)
        add(
          "minimum-reader",
          metaPath,
          "requiredVoidra",
          "Aggregate completion without a parent plan requires voidra ≥ 0.2.0",
        );
      if (a.stage === "plan" && a.status === "waiting" && !open && !plan)
        add(
          "missing-plan",
          file,
          "planApproval",
          "Plan gate requires all three valid plan files",
        );
      if (
        ["implement", "verify", "review", "done", "released"].includes(
          a.stage ?? "",
        ) &&
        !aggregate &&
        !approvalCurrent(a.planApproval, plan)
      )
        add(
          "stale-approval",
          file,
          "planApproval",
          "Plan approval is missing or stale for the exact current bytes",
        );
    }
    if (
      a.type === "release" &&
      ["review", "released"].includes(a.stage ?? "") &&
      !readPlan(files, id, records)
    )
      add(
        "missing-plan",
        file,
        "reviewDecision",
        "Release review requires all three valid plan files",
      );
    if (
      a.type === "release" &&
      a.reviewDecision?.decision === "accepted" &&
      a.reviewDecision.revision !== readPlan(files, id, records)?.revision
    )
      add(
        "stale-review",
        file,
        "reviewDecision",
        "Release review approval is stale",
      );
    if (
      a.type === "release" &&
      a.stage === "released" &&
      (!a.commits?.length || typeof a.releaseTag !== "string")
    )
      add(
        "release-evidence",
        file,
        "commits",
        "Released action requires commit and tag evidence",
      );
    if (a.doneBy === "you" && a.stage === "cancelled" && !extendedActions)
      add(
        "minimum-reader",
        metaPath,
        "requiredVoidra",
        "Human cancellation requires voidra ≥ 0.2.0",
      );
    if (
      a.status === "complete" &&
      a.stage !== "cancelled" &&
      (a.doneBy === "you" || ["done", "released"].includes(a.stage ?? "")) &&
      Array.from(actions.values()).some(
        ({ action: child }) => child.parent === id && !actionComplete(child),
      )
    )
      add(
        "parent-incomplete",
        file,
        "status",
        "Complete all children before their parent",
      );
  }
  for (const edge of ["blockedBy", "parent"] as const) {
    const active = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (active.has(id)) {
        add(
          edge === "parent" ? "parent-cycle" : "dependency-cycle",
          actions.get(id)?.file ?? metaPath,
          edge,
          `Cycle includes ${id}`,
        );
        return;
      }
      if (visited.has(id)) return;
      active.add(id);
      const a = actions.get(id)?.action;
      for (const dep of edge === "parent"
        ? a?.parent
          ? [a.parent]
          : []
        : (a?.blockedBy ?? []))
        if (actions.has(dep)) visit(dep);
      active.delete(id);
      visited.add(id);
    };
    for (const id of actions.keys()) visit(id);
  }
  for (const [file, { kind, document }] of records) {
    const d = document.data;
    if (typeof d.action === "string") reference(d.action, file, "action");
    if (kind === "idea" && typeof d.promotedTo === "string")
      reference(d.promotedTo, file, "promotedTo");
    if (kind === "run")
      for (const id of schemas.run.parse(d).consumedRecords)
        if (!records.has(id)) reference(id, file, "consumedRecords");
    if (kind === "release")
      for (const id of schemas.release.parse(d).actions) {
        reference(id, file, "actions");
        if (
          d.status === "released" &&
          !(
            actions.get(id)?.action.stage === "released" ||
            (actions.get(id)?.action.doneBy === "you" &&
              actions.get(id)?.action.releasedIn === d.version)
          )
        )
          add("release-actions", file, "actions", `${id} is not released`);
      }
    if (kind === "queue") {
      const queued = new Set<string>();
      for (const line of document.body
        .split(/\r?\n/)
        .filter((line) => line.trim())) {
        const id =
          /^\s*\d+[.)]\s+\[[ xX]\]\s+(act-[0-9a-hjkmnp-tv-z]{6})\s*$/.exec(
            line,
          )?.[1];
        if (!id || queued.has(id))
          add(
            "queue",
            file,
            "body",
            "Queue requires unique ordered action checklist entries",
          );
        else {
          queued.add(id);
          reference(id, file, "body");
          if (actions.get(id)?.action.doneBy === "you")
            add("queue", file, "body", "Only agent actions may be queued");
        }
      }
    }
    if (kind === "lock") {
      reference(String(d.run), file, "run");
    }
    if (
      kind === "operation" &&
      d.state === "prepared" &&
      d.id !== options.ignoreOperation
    )
      add(
        "incomplete-operation",
        file,
        "state",
        `Incomplete operation ${d.id}: ${schemas.operation
          .parse(d)
          .changes.map((c) => c.path)
          .join(", ")}; recover explicitly`,
      );
  }
  return result;
}
export async function checkProject(
  root: string,
  options: { lifecycles?: Lifecycles } = {},
): Promise<ProjectInspection> {
  const read = await readProjectFiles(root);
  const result = inspectFiles(read.files, options);
  result.diagnostics.unshift(...read.diagnostics);
  return result;
}
