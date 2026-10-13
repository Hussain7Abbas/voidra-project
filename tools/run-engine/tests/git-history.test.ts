import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { githubRepository, readGitHistory } from "../src/git.ts";

it("links actual trailers, follow-up commits and untagged history on a real repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra history "));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    expect((await readGitHistory(root)).notice).toMatch(/repository/);
    git(["init", "-q"]);
    git(["config", "user.name", "Tests"]);
    git(["config", "user.email", "tests@example.test"]);
    expect((await readGitHistory(root)).commits).toEqual([]);
    git(["remote", "add", "origin", "git@github.com:Owner/project.git"]);
    for (const message of [
      "Initial code",
      "Implement export\n\nVoidra-Action: act-000000\nVoidra-Action: act-000001",
      "Rework export\n\nVoidra-Action: act-000000",
      "Mention Voidra-Action: act-000000 in the subject",
    ]) {
      await writeFile(join(root, "README.md"), message);
      git(["add", "README.md"]);
      git(["commit", "-qm", message]);
    }
    const history = await readGitHistory(root);
    expect(history.notice).toBeNull();
    expect(history.commits).toHaveLength(4);
    expect(
      history.commits.filter((c) => c.actions.includes("act-000000")),
    ).toHaveLength(2);
    expect(history.commits.filter((c) => !c.actions.length)).toHaveLength(2);
    expect(history.commits[1]?.url).toBe(
      `https://github.com/Owner/project/commit/${history.commits[1]?.hash}`,
    );
    git([
      "remote",
      "set-url",
      "origin",
      "https://github.com.evil.test/Owner/project",
    ]);
    expect(
      (await readGitHistory(root)).commits.every((c) => c.url === null),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("accepts only GitHub repository remotes with safe owner and repository names", () => {
  for (const remote of [
    "https://github.com/Owner/repo.git",
    "ssh://git@github.com/Owner/repo.git",
    "git@github.com:Owner/repo.git",
  ])
    expect(githubRepository(remote)).toBe("https://github.com/Owner/repo");
  for (const remote of [
    "https://github.com@evil.test/o/r",
    "https://github.com/o/r?x=1",
    "https://github.com/o/r/extra",
    "https://github.com/o/..",
    "file:///o/r",
    "https://user:secret@github.com/o/r",
    "https://github.com:444/o/r",
  ])
    expect(githubRepository(remote)).toBeNull();
});
