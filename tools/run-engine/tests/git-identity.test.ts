import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readGitIdentity } from "../src/git.ts";

it("reads effective project Git identity and reports missing configuration without inventing an assignee", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-git-identity-"));
  const env = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    expect(await readGitIdentity(root, env)).toMatchObject({ value: null });
    execFileSync("git", ["config", "user.name", "Fixture Owner"], {
      cwd: root,
    });
    expect((await readGitIdentity(root, env)).notice).toMatch(/email/);
    execFileSync("git", ["config", "user.email", "owner@example.test"], {
      cwd: root,
    });
    expect(await readGitIdentity(root, env)).toEqual({
      name: "Fixture Owner",
      email: "owner@example.test",
      value: "Fixture Owner <owner@example.test>",
      notice: null,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
