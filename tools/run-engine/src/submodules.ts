import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execute = promisify(execFile);
const objectId = z.string().regex(/^[a-f0-9]{40,64}$/);
export const submoduleSnapshotSchema = z.looseObject({
  parent: z.string(),
  head: objectId.nullable(),
  tags: z.string(),
  indexObject: objectId,
  recordedObject: objectId.nullable(),
  initialized: z.boolean(),
});
export type SubmoduleSnapshot = z.infer<typeof submoduleSnapshotSchema>;
export const submoduleCommitSchema = z.looseObject({
  path: z.string(),
  paths: z.array(z.string()),
  baseCommit: objectId,
  indexBefore: z.string(),
  commit: objectId.optional(),
  indexReconciled: z.boolean().optional(),
});
export type SubmoduleCommit = z.infer<typeof submoduleCommitSchema>;

async function git(root: string, args: string[]): Promise<string> {
  return (
    await execute("git", ["--literal-pathspecs", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    })
  ).stdout;
}
function pathParts(path: string): string[] {
  const parts = path.split("/");
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    parts.some(
      (part) =>
        !part || [".", "..", ".git", ".voidra"].includes(part.toLowerCase()),
    )
  )
    throw Error("Invalid submodule path");
  return parts;
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Enumerate Git index gitlinks, never infer a submodule by reading its directory as a file. */
export async function readSubmodules(
  root: string,
): Promise<Record<string, SubmoduleSnapshot>> {
  const result: Record<string, SubmoduleSnapshot> = {};
  if (
    !(await exists(join(root, ".git"))) &&
    !(await git(root, ["rev-parse", "--show-toplevel"]).catch(() => ""))
  )
    return result;
  const visit = async (repository: string, prefix: string): Promise<void> => {
    const rows = (await git(repository, ["ls-files", "--stage", "-z"])).split(
      "\0",
    );
    for (const row of rows) {
      if (!row.startsWith("160000 ")) continue;
      const entry = /^160000 ([a-f0-9]{40,64}) ([0-3])\t([\s\S]+)$/.exec(row);
      if (entry?.[2] !== "0")
        throw Error("Resolve the submodule Git index conflict before running");
      const local = entry[3] as string,
        path = prefix ? `${prefix}/${local}` : local;
      let folder = await realpath(root);
      let present = true;
      for (const part of pathParts(path)) {
        folder = join(folder, part);
        if (!(await exists(folder))) {
          present = false;
          break;
        }
        const info = await lstat(folder);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw Error(`Submodule path must contain real directories: ${path}`);
      }
      const gitPath = join(folder, ".git");
      const initialized = present && (await exists(gitPath));
      let head: string | null = null,
        tags = "";
      if (initialized) {
        if ((await lstat(gitPath)).isSymbolicLink())
          throw Error(`Submodule Git marker cannot be a symlink: ${path}`);
        const top = (
          await git(folder, ["rev-parse", "--show-toplevel"])
        ).trim();
        if ((await realpath(top)) !== (await realpath(folder)))
          throw Error(
            `Submodule repository does not match its folder: ${path}`,
          );
        head = (await git(folder, ["rev-parse", "--verify", "HEAD"])).trim();
        tags = (
          await git(folder, [
            "for-each-ref",
            "--format=%(refname):%(objectname)",
            "refs/tags",
          ])
        ).trim();
      }
      const recorded = await git(repository, [
        "ls-tree",
        "-z",
        "HEAD",
        "--",
        local,
      ]).catch(() => "");
      result[path] = {
        parent: prefix,
        head,
        tags,
        indexObject: entry[1] as string,
        recordedObject:
          /^160000 commit ([a-f0-9]{40,64})\t/.exec(recorded)?.[1] ?? null,
        initialized,
      };
      if (initialized) await visit(folder, path);
    }
  };
  await visit(root, "");
  return result;
}

/** Dirty files are scoped to their owning repository; a dirty gitlink is not a text file. */
export async function changedRepositoryPaths(
  root: string,
  modules: Record<string, SubmoduleSnapshot>,
): Promise<string[]> {
  const paths = new Set<string>();
  for (const prefix of [
    "",
    ...Object.keys(modules).filter((path) => modules[path]?.initialized),
  ]) {
    const repository = join(root, prefix);
    for (const args of [
      ["diff", "--ignore-submodules=all", "--name-only", "-z"],
      ["diff", "--cached", "--ignore-submodules=all", "--name-only", "-z"],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ])
      for (const local of (await git(repository, args))
        .split("\0")
        .filter(Boolean)) {
        const path = prefix ? `${prefix}/${local}` : local;
        if (!Object.hasOwn(modules, path)) paths.add(path);
      }
  }
  return [...paths];
}

export function submoduleOwner(
  path: string,
  modules: Record<string, SubmoduleSnapshot>,
): string | null {
  return (
    Object.keys(modules)
      .filter((module) => path === module || path.startsWith(`${module}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

export async function assertSubmodules(
  root: string,
  expected: Record<string, SubmoduleSnapshot> | undefined,
  commits: SubmoduleCommit[] = [],
): Promise<void> {
  if (!expected) return;
  const actual = await readSubmodules(root);
  if (
    JSON.stringify(Object.keys(actual).sort()) !==
    JSON.stringify(Object.keys(expected).sort())
  )
    throw Error("Submodule topology changed outside this run");
  for (const [path, before] of Object.entries(expected)) {
    const current = actual[path];
    const own = commits.find((commit) => commit.path === path)?.commit;
    if (
      !current ||
      current.initialized !== before.initialized ||
      current.head !== (own ?? before.head) ||
      current.tags !== before.tags ||
      current.parent !== before.parent ||
      (current.indexObject !== before.indexObject &&
        current.indexObject !== own) ||
      (current.recordedObject !== before.recordedObject &&
        current.recordedObject !== own)
    )
      throw Error(
        `Submodule HEAD, tags, pointers or initialization changed outside this run: ${path}`,
      );
  }
}

export function assertSubmoduleEdit(
  path: string,
  modules: Record<string, SubmoduleSnapshot>,
): void {
  let owner = submoduleOwner(path, modules);
  if (owner === path)
    throw Error("List exact files inside a submodule, not its directory");
  while (owner) {
    const module = modules[owner];
    if (!module?.initialized)
      throw Error(
        `Initialize the submodule before editing its files: ${owner}`,
      );
    if (
      module.head !== module.recordedObject ||
      module.indexObject !== module.recordedObject
    )
      throw Error(
        `Record existing submodule pointer changes in its parent before editing: ${owner}`,
      );
    owner = module.parent || null;
  }
}

export function submoduleCommitPaths(
  paths: string[],
  modules: Record<string, SubmoduleSnapshot>,
): { path: string; paths: string[] }[] {
  const groups = new Map<string, Set<string>>();
  const add = (owner: string, path: string): void => {
    const selected = groups.get(owner) ?? new Set<string>();
    selected.add(path);
    groups.set(owner, selected);
  };
  for (const path of paths) {
    assertSubmoduleEdit(path, modules);
    let owner = submoduleOwner(path, modules);
    if (!owner) continue;
    add(owner, path.slice(owner.length + 1));
    while (modules[owner]?.parent) {
      const parent = modules[owner]?.parent as string;
      add(parent, owner.slice(parent.length + 1));
      owner = parent;
    }
  }
  return [...groups]
    .sort(
      ([a], [b]) =>
        b.split("/").length - a.split("/").length || a.localeCompare(b),
    )
    .map(([path, selected]) => ({ path, paths: [...selected].sort() }));
}

export async function assertSubmoduleReady(
  root: string,
  path: string,
): Promise<void> {
  const repository = join(root, path);
  for (const marker of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
  ]) {
    const target = resolve(
      repository,
      (await git(repository, ["rev-parse", "--git-path", marker])).trim(),
    );
    if (await exists(target))
      throw Error(
        `Finish the existing Git operation in submodule before committing: ${path}`,
      );
  }
}

export async function planSubmoduleCommits(
  root: string,
  paths: string[],
  modules: Record<string, SubmoduleSnapshot>,
): Promise<SubmoduleCommit[]> {
  const result: SubmoduleCommit[] = [];
  for (const { path, paths: selected } of submoduleCommitPaths(
    paths,
    modules,
  )) {
    const baseCommit = modules[path]?.head;
    await assertSubmoduleReady(root, path);
    if (!baseCommit)
      throw Error(`Submodule has no checked-out commit: ${path}`);
    result.push({
      path,
      paths: selected,
      baseCommit,
      indexBefore: await git(join(root, path), [
        "ls-files",
        "--stage",
        "-z",
        "--",
        ...selected,
      ]),
    });
  }
  return result;
}

export function parentCommitPaths(
  paths: string[],
  commits: SubmoduleCommit[],
): string[] {
  const roots = commits
    .map((commit) => commit.path)
    .filter(
      (path) => !commits.some((parent) => path.startsWith(`${parent.path}/`)),
    );
  return [
    ...new Set(
      paths.map(
        (path) => roots.find((module) => path.startsWith(`${module}/`)) ?? path,
      ),
    ),
  ];
}
