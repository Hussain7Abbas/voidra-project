import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export interface GitIdentity {
  name: string | null;
  email: string | null;
  value: string | null;
  notice: string | null;
}
export async function readGitIdentity(
  root: string,
  environment: Record<string, string> = {},
): Promise<GitIdentity> {
  async function value(key: string): Promise<string | null> {
    try {
      const result = await execute("git", ["config", "--get", key], {
        cwd: root,
        env: { ...process.env, ...environment },
        encoding: "utf8",
      });
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }
  const [name, email] = await Promise.all([
    value("user.name"),
    value("user.email"),
  ]);
  return {
    name,
    email,
    value: name && email ? `${name} <${email}>` : null,
    notice:
      name && email
        ? null
        : `Git ${[!name ? "name" : null, !email ? "email" : null].filter(Boolean).join(" and ")} is not configured. You can leave work unassigned.`,
  };
}

export interface GitCommit {
  hash: string;
  subject: string;
  author: string;
  at: string;
  actions: string[];
  url: string | null;
}
export interface GitHistory {
  commits: GitCommit[];
  repository: string | null;
  notice: string | null;
}
export function githubRepository(remote: string): string | null {
  const scp = /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(
    remote,
  );
  let owner: string | undefined, repo: string | undefined;
  if (scp) {
    owner = scp[1];
    repo = scp[2];
  } else {
    try {
      const url = new URL(remote);
      if (
        url.hostname !== "github.com" ||
        url.port ||
        url.search ||
        url.hash ||
        url.password ||
        !(
          (url.protocol === "https:" && !url.username) ||
          (url.protocol === "ssh:" && url.username === "git")
        )
      )
        return null;
      const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(
        url.pathname,
      );
      owner = match?.[1];
      repo = match?.[2];
    } catch {
      return null;
    }
  }
  repo = repo?.replace(/\.git$/, "");
  if (
    !owner ||
    !repo ||
    [owner, repo].some((value) => value === "." || value === "..")
  )
    return null;
  return `https://github.com/${owner}/${repo}`;
}
export async function readGitHistory(root: string): Promise<GitHistory> {
  async function git(args: string[]): Promise<string> {
    return (
      await execute("git", args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
  }
  try {
    await git(["rev-parse", "--show-toplevel"]);
  } catch {
    return {
      commits: [],
      repository: null,
      notice: "This folder is not a Git repository. Commit links require Git.",
    };
  }
  const repository = githubRepository(
    await git(["remote", "get-url", "origin"])
      .catch(() => "")
      .then((value) => value.trim()),
  );
  if (!(await git(["rev-parse", "--verify", "HEAD"]).catch(() => "")))
    return { commits: [], repository, notice: null };
  try {
    const raw = await git([
      "log",
      "-z",
      "--format=%H%x00%s%x00%an%x00%aI%x00%(trailers:key=Voidra-Action,valueonly,separator=%x1f)",
      "HEAD",
      "--",
    ]);
    const fields = raw.split("\0"),
      commits: GitCommit[] = [];
    for (let index = 0; index + 4 < fields.length; index += 5) {
      const commitHash = fields[index] ?? "";
      if (!/^[a-f0-9]{40,64}$/.test(commitHash))
        throw new Error("Invalid Git history response");
      commits.push({
        hash: commitHash,
        subject: fields[index + 1] ?? "",
        author: fields[index + 2] ?? "",
        at: fields[index + 3] ?? "",
        actions: [
          ...new Set(
            (fields[index + 4] ?? "")
              .split("\x1f")
              .map((value) => value.trim())
              .filter((value) => /^act-[0-9a-hjkmnp-tv-z]{6}$/.test(value)),
          ),
        ],
        url: repository ? `${repository}/commit/${commitHash}` : null,
      });
    }
    return { commits, repository, notice: null };
  } catch (error) {
    return {
      commits: [],
      repository,
      notice: error instanceof Error ? error.message : String(error),
    };
  }
}
