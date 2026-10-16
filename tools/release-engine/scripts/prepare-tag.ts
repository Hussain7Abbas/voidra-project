import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReleaseRequest } from "../src/bump.ts";
import { RELEASE_REPOSITORY } from "../src/github.ts";
import { alignVersions, readAlignment, selectNotes } from "../src/release.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const { version, tag } = await resolveReleaseRequest(root, {
  version: process.env.VERSION,
  bump: process.env.BUMP,
});
const token = execFileSync("gh", ["auth", "token", "--user", "Hussain7Abbas"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const env = {
  ...process.env,
  VERSION: version,
  BUMP: "",
  GH_TOKEN: token,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.extraheader",
  GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
};
const git = (args: string[]) =>
  execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
const requestedAt = new Date().toISOString();
try {
  if (git(["status", "--porcelain", "--untracked-files=all"]))
    throw Error(
      "Commit source changes before starting or retrying a release; preserved.",
    );
  const remote = git(["ls-remote", "origin", `refs/tags/${tag}`]).split(
    /\s/,
  )[0];
  let local = "";
  try {
    local = git(["rev-parse", `refs/tags/${tag}`]);
  } catch {}
  if (remote && local && remote !== local)
    throw Error("Local and remote tags differ; never move a published tag");
  if (remote || local) {
    if (!remote) git(["push", "origin", `refs/tags/${tag}`]);
    execFileSync(
      "gh",
      [
        "workflow",
        "run",
        "release.yml",
        "--repo",
        RELEASE_REPOSITORY,
        "--ref",
        tag,
        "-f",
        `tag=${tag}`,
      ],
      { env, stdio: "inherit" },
    );
    console.log(
      `Retrying the original immutable ${tag}; newer working-tree source is not republished.`,
    );
  } else {
    const startingHead = git(["rev-parse", "HEAD"]);
    await selectNotes(root, version);
    const versionPaths = new Set(await alignVersions(root, version));
    execFileSync("pnpm", ["--filter", "voidra", "build"], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    execFileSync("make", ["gen"], { cwd: root, env, stdio: "inherit" });
    const generated = (path: string) =>
      /^(?:docs\/format\/|fixtures\/(?:architecture|lifecycles|knowledge|releases|sync)\/|skills\/(?:shared\/references\/|voidra-[a-z-]+\/(?:scripts\/|references\/)))/.test(
        path,
      );
    const paths = git(["diff", "--name-only"]).split("\n").filter(Boolean),
      fingerprints = new Map<string, string>();
    if (paths.some((path) => !versionPaths.has(path) && !generated(path)))
      throw Error(
        "Unexpected source edits arrived during generation; preserved.",
      );
    for (const path of paths)
      fingerprints.set(
        path,
        createHash("sha256")
          .update(await readFile(join(root, path)))
          .digest("hex"),
      );
    execFileSync("make", ["check"], { cwd: root, env, stdio: "inherit" });
    execFileSync("make", ["e2e"], {
      cwd: root,
      env: { ...env, VOIDRA_TEST_BACKGROUND: "0" },
      stdio: "inherit",
    });
    if (
      git(["rev-parse", "HEAD"]) !== startingHead ||
      git(["status", "--porcelain", "--untracked-files=all"])
        .split("\n")
        .some((line) => line.startsWith("?? "))
    )
      throw Error(
        "Source history or untracked inputs changed during checks; preserved.",
      );
    if (git(["diff", "--cached", "--name-only"]))
      throw Error("Git staging changed during checks; preserved.");
    if (
      git(["diff", "--name-only"])
        .split("\n")
        .filter(Boolean)
        .sort()
        .join("\n") !== paths.sort().join("\n")
    )
      throw Error("Outside source edits arrived during checks; preserved.");
    for (const [path, expected] of fingerprints)
      if (
        createHash("sha256")
          .update(await readFile(join(root, path)))
          .digest("hex") !== expected
      )
        throw Error(`Source changed during checks: ${path}`);
    if (paths.length)
      git([
        "--literal-pathspecs",
        "commit",
        "--only",
        "-m",
        `Release ${version}`,
        "--",
        ...paths,
      ]);
    if ((await readAlignment(root)).version !== version)
      throw Error("Version alignment changed");
    git(["tag", tag]);
    git(["push", "origin", "HEAD", `refs/tags/${tag}`]);
    console.log(
      `Pushed ${tag}; release workflow builds/tests/stages before publication.`,
    );
  }
  const directory = join(root, ".cache/releases", tag);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "requested.json"),
    JSON.stringify(
      {
        tag,
        at: requestedAt,
        github: "workflow-dispatched",
        npm: "pending",
        skills: "pending",
      },
      null,
      2,
    ),
  );
  execFileSync(process.execPath, ["tools/release-engine/scripts/finish.ts"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    "Completed tags/publications are preserved. Fix uncommitted prepared source or retry the original tag; never force-push.",
  );
  process.exitCode = 1;
}
