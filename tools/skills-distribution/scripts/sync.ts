import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "../src/sync.ts";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const dryRun = process.env.DRY_RUN === "1";
let owned: string | undefined;
try {
  const env = { ...process.env };
  // Keep the selected existing account; never persist or log the token.
  if (!dryRun) {
    const token = execFileSync(
      "gh",
      ["auth", "token", "--user", "Hussain7Abbas"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  let destinationRoot = process.env.SKILLS_REPO
    ? resolve(process.env.SKILLS_REPO)
    : undefined;
  if (!destinationRoot) {
    owned = await mkdtemp(join(tmpdir(), "voidra-skills-release-"));
    destinationRoot = join(owned, "repository");
    execFileSync(
      "git",
      [
        "clone",
        "--quiet",
        "https://github.com/Hussain7Abbas/voidra-skills.git",
        destinationRoot,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
  }
  // Identity belongs to this release command, not global or destination configuration.
  if (!dryRun) {
    env.GIT_AUTHOR_NAME = execFileSync("git", ["config", "user.name"], {
      cwd: sourceRoot,
      encoding: "utf8",
    }).trim();
    env.GIT_AUTHOR_EMAIL = execFileSync("git", ["config", "user.email"], {
      cwd: sourceRoot,
      encoding: "utf8",
    }).trim();
    env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME;
    env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;
    if (!env.GIT_AUTHOR_NAME || !env.GIT_AUTHOR_EMAIL)
      throw new Error(
        "Set this source repository's Git identity before publishing.",
      );
  }
  const result = await syncSkills({
    sourceRoot,
    destinationRoot,
    dryRun,
    env,
    log: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(
    `${JSON.stringify({ dryRun, paths: result.paths, published: result.published }, null, 2)}\n`,
  );
  if (owned) await rm(owned, { recursive: true, force: true });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  if (owned)
    process.stderr.write(`Release checkout preserved for recovery: ${owned}\n`);
  process.exitCode = 1;
}
