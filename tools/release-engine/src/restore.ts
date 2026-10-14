import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { GitHubReleaseRemote, RELEASE_REPOSITORY } from "./github.ts";
import {
  manifestBytes,
  readAlignment,
  type StagedRelease,
  selectNotes,
  verifyStage,
} from "./release.ts";
import { isReleaseVersion } from "./version.ts";

const fileSchema = z.object({
  name: z.string().regex(/^[-A-Za-z0-9._]+$/),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(512 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.object({
  schema: z.literal(1),
  version: z.string().refine(isReleaseVersion),
  tag: z.string(),
  source: z.string().regex(/^[a-f0-9]{40}$/),
  notes: z.string().max(100000),
  files: z.array(fileSchema).min(2).max(10),
  npmAsset: z.string(),
  npmIntegrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+={0,2}$/),
  skillsHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function loadStage(directory: string): Promise<StagedRelease> {
  const raw = await readFile(join(directory, "release-manifest.json")),
    manifest = manifestSchema.parse(JSON.parse(raw.toString()));
  if (
    manifest.tag !== `v${manifest.version}` ||
    manifest.npmAsset !== `voidra-${manifest.version}.tgz` ||
    new Set(manifest.files.map((file) => file.name)).size !==
      manifest.files.length ||
    manifest.files.some((file) =>
      ["CHECKSUMS.txt", "release-manifest.json"].includes(file.name),
    )
  )
    throw Error("Release manifest identity is invalid");
  const stage = { ...manifest, directory };
  if (!raw.equals(manifestBytes(stage)))
    throw Error("Release manifest bytes are not canonical");
  await verifyStage(stage);
  return stage;
}
export async function restoreAssets(
  root: string,
  directory: string,
  tag: string,
  env: NodeJS.ProcessEnv = process.env,
  execute?: (args: string[]) => Buffer,
): Promise<StagedRelease | null> {
  const { version } = await readAlignment(root),
    source = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  if (tag !== `v${version}`) throw Error("Tag and source versions differ");
  await mkdir(directory, { recursive: true });
  const command =
    execute ??
    ((args: string[]) =>
      execFileSync("gh", args, {
        env,
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }));
  const shell = (args: string[]) => command(args).toString();
  const name = `voidra-release-${tag}-${source}`,
    result = JSON.parse(
      shell([
        "api",
        `repos/${RELEASE_REPOSITORY}/actions/artifacts?name=${name}&per_page=100`,
      ]),
    ) as {
      artifacts: Array<{
        name: string;
        expired: boolean;
        workflow_run?: { id: number; head_sha: string };
      }>;
    };
  const artifact = result.artifacts.find(
    (item) =>
      item.name === name &&
      !item.expired &&
      item.workflow_run?.head_sha === source,
  );
  if (artifact?.workflow_run) {
    shell([
      "run",
      "download",
      String(artifact.workflow_run.id),
      "--repo",
      RELEASE_REPOSITORY,
      "--name",
      name,
      "--dir",
      directory,
    ]);
    const stage = await loadStage(directory);
    if (
      stage.source !== source ||
      stage.tag !== tag ||
      stage.notes.trim() !== (await selectNotes(root, version)).trim()
    )
      throw Error("Restored CI artifact source/notes mismatch");
    return stage;
  }
  const remote = new GitHubReleaseRemote(
      {
        schema: 1,
        version,
        tag,
        source,
        notes: await selectNotes(root, version),
        directory,
        files: [],
        npmAsset: `voidra-${version}.tgz`,
        npmIntegrity: "",
        skillsHash: "",
      },
      env,
      command,
    ),
    manifest = await remote.readAsset("release-manifest.json");
  if (!manifest) {
    const existing = await remote.release();
    if (existing?.assets.length)
      throw Error(
        "Original staged CI artifact is unavailable for a partial draft; stop instead of rebuilding different bytes",
      );
    return null;
  }
  const parsed = manifestSchema.parse(JSON.parse(manifest.toString()));
  if (
    parsed.source !== source ||
    parsed.tag !== tag ||
    parsed.notes.trim() !== (await selectNotes(root, version)).trim()
  )
    throw Error("Existing release source/notes mismatch");
  for (const file of [
    ...parsed.files.map((file) => file.name),
    "CHECKSUMS.txt",
    "release-manifest.json",
  ]) {
    if (!/^[-A-Za-z0-9._]+$/.test(file))
      throw Error("Unsafe release asset name");
    const bytes = await remote.readAsset(file);
    if (!bytes) throw Error("Existing release is incomplete; preserve it");
    await writeFile(join(directory, file), bytes);
  }
  return loadStage(directory);
}
