import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NpmReleaseRemote } from "../src/npm.ts";
import { publishNpm } from "../src/release.ts";
import { restoreAssets } from "../src/restore.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  tag = process.env.RELEASE_TAG ?? "";
try {
  if (
    process.env.GITHUB_REF !== `refs/tags/${tag}` ||
    process.env.GITHUB_SHA !==
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim()
  )
    throw Error("Dispatch the npm workflow at the exact source tag");
  const stage = await restoreAssets(
    root,
    join(root, ".cache/npm-publication", tag),
    tag,
  );
  if (!stage) throw Error("The tested staged release is missing");
  const remote = new NpmReleaseRemote(stage);
  await publishNpm(stage, remote);
  console.log(
    `npm published and verified: voidra@${stage.version}, integrity ${stage.npmIntegrity}, provenance ${stage.source}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    "Any already published destination is preserved; verify its checkpoint before retrying.",
  );
  process.exitCode = 1;
}
