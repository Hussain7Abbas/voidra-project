import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSkills } from "../../skills-distribution/src/sync.ts";
import { GitHubReleaseRemote, RELEASE_REPOSITORY } from "../src/github.ts";
import { inspectNpm } from "../src/npm.ts";
import { loadStage } from "../src/restore.ts";
import { isReleaseVersion } from "../src/version.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  version = process.env.VERSION ?? "";
if (!isReleaseVersion(version)) throw Error("Set VERSION=X.Y.Z");
const tag = `v${version}`,
  token = execFileSync("gh", ["auth", "token", "--user", "Hussain7Abbas"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim(),
  env: NodeJS.ProcessEnv = {
    ...process.env,
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
  };
const directory = join(root, ".cache/releases", tag);
await mkdir(directory, { recursive: true });
const requestText = await readFile(
  join(directory, "requested.json"),
  "utf8",
).catch((error) => {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
  throw error;
});
const request = requestText
    ? (JSON.parse(requestText) as { tag: string; at: string })
    : null,
  requestedAt = request ? Date.parse(request.at) : 0;
if ((request && request.tag !== tag) || !Number.isFinite(requestedAt))
  throw Error("Release request checkpoint is invalid");
const temp = await mkdtemp(join(tmpdir(), "voidra-release-finish-"));
let github = false,
  npm = false,
  skills = false;
try {
  const shell = (exe: string, args: string[], cwd = root) =>
    execFileSync(exe, args, {
      cwd,
      env,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const probe = new GitHubReleaseRemote(
      {
        schema: 1,
        version,
        tag,
        source: "",
        notes: "",
        files: [],
        npmAsset: `voidra-${version}.tgz`,
        npmIntegrity: "",
        skillsHash: "",
        directory,
      },
      env,
    ),
    source = await probe.source(),
    deadline = Date.now() + 45 * 60 * 1000;
  let last = "",
    stage: Awaited<ReturnType<typeof loadStage>> | null = null;
  while (Date.now() < deadline) {
    const release = await probe.inspect();
    github = !!release && !release.draft;
    if (github && !stage) {
      const manifest = await probe.readAsset("release-manifest.json");
      if (!manifest) throw Error("Published release is missing its manifest");
      await writeFile(join(directory, "release-manifest.json"), manifest);
      const raw = JSON.parse(manifest.toString()) as {
        files: Array<{ name: string }>;
      };
      for (const name of [
        ...raw.files.map((file) => file.name),
        "CHECKSUMS.txt",
      ]) {
        if (!/^[-A-Za-z0-9._]+$/.test(name) || name === "." || name === "..")
          throw Error("Unsafe published asset path");
        const body = await probe.readAsset(name);
        if (!body) throw Error(`Missing published asset ${name}`);
        await writeFile(join(directory, name), body);
      }
      stage = await loadStage(directory);
      if (stage.source !== source || stage.tag !== tag)
        throw Error("Published release source mismatch");
    }
    if (stage) {
      const published = await inspectNpm(stage);
      if (published && published.integrity !== stage.npmIntegrity)
        throw Error(
          "Published npm bytes mismatch; preserve and choose a new version",
        );
      if (published?.source && published.source !== source)
        throw Error("Published npm provenance mismatch");
      npm =
        published?.source === source &&
        published.integrity === stage.npmIntegrity;
      if (npm) break;
    }
    const runs = JSON.parse(
      shell("gh", [
        "run",
        "list",
        "--repo",
        RELEASE_REPOSITORY,
        "--limit",
        "12",
        "--json",
        "headSha,status,conclusion,workflowName,url,createdAt",
      ]),
    ) as Array<{
      headSha: string;
      status: string;
      conclusion: string;
      workflowName: string;
      url: string;
      createdAt: string;
    }>;
    const wanted = runs.filter(
      (run) =>
        run.headSha === source &&
        ["Release", "Publish npm"].includes(run.workflowName),
    );
    const state = wanted
      .map((run) => `${run.workflowName}: ${run.status} ${run.conclusion}`)
      .join("; ");
    if (state !== last) {
      console.log(state || "Waiting for the exact-tag release workflow.");
      last = state;
    }
    const latest = new Map<string, (typeof wanted)[number]>();
    for (const run of wanted)
      if (
        Date.parse(run.createdAt) >= requestedAt - 1000 &&
        !latest.has(run.workflowName)
      )
        latest.set(run.workflowName, run);
    const recent = [...latest.values()];
    const failed = recent.find(
      (run) => run.status === "completed" && run.conclusion === "failure",
    );
    if (
      failed &&
      !recent.some(
        (run) =>
          run.workflowName === failed.workflowName &&
          run.status !== "completed",
      )
    )
      throw Error(`${failed.workflowName} failed: ${failed.url}`);
    await new Promise<void>((done) => setTimeout(done, 10000));
  }
  if (!stage || !npm)
    throw Error(
      "Publication verification timed out; retry the original tag without replacing completed destinations",
    );
  const sourceFolder = join(temp, "source"),
    destination = join(temp, "skills");
  await mkdir(sourceFolder);
  shell("git", ["fetch", "--no-tags", "origin", `refs/tags/${tag}`]);
  const archive = execFileSync(
    "git",
    ["archive", "--format=tar", source, "skills", "templates", "LICENSE"],
    { cwd: root, env, maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", sourceFolder], { input: archive });
  shell("git", [
    "clone",
    "--quiet",
    "https://github.com/Hussain7Abbas/voidra-skills.git",
    destination,
  ]);
  env.GIT_AUTHOR_NAME = shell("git", ["config", "user.name"]).trim();
  env.GIT_AUTHOR_EMAIL = shell("git", ["config", "user.email"]).trim();
  env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME;
  env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;
  await syncSkills({
    sourceRoot: sourceFolder,
    destinationRoot: destination,
    dryRun: false,
    env,
    log: (message) => console.log(message),
  });
  skills = true;
  console.log(
    `Complete: GitHub ${tag}, npm voidra@${version} with matching provenance, and exact tagged skill copies.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    `Publication checkpoints: GitHub=${github}, npm=${npm}, skills=${skills}. Completed destinations are preserved.`,
  );
  process.exitCode = 1;
} finally {
  await writeFile(
    join(directory, "status.json"),
    JSON.stringify(
      { tag, github, npm, skills, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  await rm(temp, { recursive: true, force: true });
}
