import { bumpVersion, formatSemVer, parseSemVer } from "xeploy";
import { readAlignment } from "./release.ts";
import { isReleaseVersion } from "./version.ts";

export interface ReleaseRequest {
  version?: string | undefined;
  bump?: string | undefined;
}

/** Resolve a release request without changing files, Git or remote state. */
export async function resolveReleaseRequest(
  root: string,
  { version, bump }: ReleaseRequest,
): Promise<{ version: string; tag: string }> {
  if (version && bump) throw Error("Set either VERSION or BUMP, never both");
  if (version) {
    if (!isReleaseVersion(version)) throw Error("Set VERSION=X.Y.Z");
    // Explicit identifiers must remain usable for immutable source-tag retries.
    return { version, tag: `v${version}` };
  }
  if (!bump) throw Error("Set VERSION=X.Y.Z or BUMP=patch|minor|major");
  if (bump !== "patch" && bump !== "minor" && bump !== "major")
    throw Error("BUMP must be patch, minor or major");
  const current = (await readAlignment(root)).version;
  if (!current.split(".").every((part) => Number.isSafeInteger(Number(part))))
    throw Error("Xeploy bump components must be within the safe integer range");
  const parsed = parseSemVer(current);
  if (!parsed) throw Error("Xeploy could not parse the aligned version");
  const next = bumpVersion(bump === "patch" ? "bugfix" : bump, parsed);
  if (![next.major, next.minor, next.patch].every(Number.isSafeInteger))
    throw Error("Xeploy bump exceeds the safe integer range");
  // Xeploy's bump API returns an RC; Voidra's release pipeline uses final tags.
  version = formatSemVer({ ...next, rc: null });
  return { version, tag: `v${version}` };
}
