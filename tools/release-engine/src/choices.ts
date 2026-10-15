import { type ProjectRelease, readProjectRelease } from "voidra";
import { bumpVersion, formatSemVer, parseSemVer } from "xeploy";
import { compareReleaseVersions, isReleaseVersion } from "./version.ts";

export type ReleaseBump = "patch" | "minor" | "major" | "custom";
function stable(value: string): NonNullable<ReturnType<typeof parseSemVer>> {
  if (
    !isReleaseVersion(value) ||
    !value.split(".").every((part) => Number.isSafeInteger(Number(part)))
  )
    throw Error("Use a stable X.Y.Z version with safe integer components");
  const parsed = parseSemVer(value);
  if (!parsed) throw Error("Xeploy could not parse this version");
  return parsed;
}
/** Applicable Xeploy bump choices for Voidra's approved local, final-release flow. */
export function releaseVersionChoices(
  current: string,
): { value: Exclude<ReleaseBump, "custom">; label: string; version: string }[] {
  const source = stable(current);
  return (
    [
      ["patch", "Bug fix"],
      ["minor", "Minor"],
      ["major", "Major"],
    ] as const
  ).map(([value, label]) => {
    const bumped = bumpVersion(value === "patch" ? "bugfix" : value, source),
      version = formatSemVer({ ...bumped, rc: null });
    stable(version);
    return { value, label, version };
  });
}
export function selectedReleaseVersion(
  current: string,
  bump: ReleaseBump,
  custom = "",
): string {
  stable(current);
  const version =
    bump === "custom"
      ? custom
      : releaseVersionChoices(current).find((choice) => choice.value === bump)
          ?.version;
  if (!version) throw Error("Choose a release bump type");
  stable(version);
  if (compareReleaseVersions(version, current) <= 0)
    throw Error("The new release must follow the current version");
  return version;
}

/** Shared app/standalone preview. It reads version metadata and performs no Git/source effects. */
export async function projectReleaseOptions(root: string): Promise<{
  source: ProjectRelease;
  choices: ReturnType<typeof releaseVersionChoices>;
}> {
  const source = await readProjectRelease(root);
  let choices: ReturnType<typeof releaseVersionChoices> = [];
  if (source.version) {
    try {
      choices = releaseVersionChoices(source.version);
    } catch (error) {
      source.message =
        error instanceof Error
          ? error.message
          : "Release versions are unavailable";
    }
  }
  return { source, choices };
}
