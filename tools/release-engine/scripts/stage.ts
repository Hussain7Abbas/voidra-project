import { execFileSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GitHubReleaseRemote, RELEASE_REPOSITORY } from "../src/github.ts";
import { publishGitHub, readAlignment, stageRelease } from "../src/release.ts";
import { loadStage, restoreAssets } from "../src/restore.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? "",
  mode = process.argv[2],
  directory = join(root, ".cache/release-artifacts", tag);
try {
  const { version } = await readAlignment(root);
  if (
    tag !== `v${version}` ||
    process.env.GITHUB_REF !== `refs/tags/${tag}` ||
    process.env.GITHUB_SHA !==
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim()
  )
    throw Error("Release staging requires the exact aligned source tag");
  if (mode === "restore") {
    const restored = await restoreAssets(root, directory, tag);
    if (process.env.GITHUB_OUTPUT)
      await writeFile(
        process.env.GITHUB_OUTPUT,
        `restored=${!!restored}\nartifact=voidra-release-${tag}-${process.env.GITHUB_SHA}\n`,
        { flag: "a" },
      );
    console.log(
      restored
        ? "Reusing the original source-bound staged bytes."
        : "No completed staging checkpoint; build a fresh candidate.",
    );
  } else if (mode === "prepare") {
    await mkdir(directory, { recursive: true });
    const dmg = `Voidra-Project-${version}-arm64.dmg`;
    await cp(join(root, "apps/desktop/release", dmg), join(directory, dmg));
    const output = JSON.parse(
      execFileSync(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
        { cwd: join(root, "packages/voidra"), encoding: "utf8" },
      ),
    );
    if (output[0]?.filename !== `voidra-${version}.tgz`)
      throw Error("Packed archive version differs");
    await stageRelease(root, directory, tag, [dmg, output[0].filename]);
  } else if (mode === "publish") {
    const stage = await loadStage(directory),
      inject =
        process.env.VOIDRA_RELEASE_TEST_TAG === tag
          ? process.env.VOIDRA_RELEASE_FAILURE
          : "";
    if (inject === "before-staging")
      throw Error(
        "Injected network-boundary failure before GitHub staging; no public release created.",
      );
    await publishGitHub(stage, new GitHubReleaseRemote(stage));
    console.log(
      `GitHub published: ${tag}. npm and skill destinations remain separate checkpoints.`,
    );
    if (inject === "after-github")
      throw Error(
        "Injected failure after GitHub publication; preserve the public release and retry remaining destinations.",
      );
    execFileSync(
      "gh",
      [
        "workflow",
        "run",
        "publish-npm.yml",
        "--repo",
        RELEASE_REPOSITORY,
        "--ref",
        tag,
        "-f",
        `tag=${tag}`,
      ],
      { stdio: "inherit" },
    );
    console.log(
      "Dispatched exact-tag npm OIDC publication; no personal npm token is used.",
    );
  } else throw Error("Use restore, prepare or publish");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
