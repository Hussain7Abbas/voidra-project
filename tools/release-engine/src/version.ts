/** Canonical stable identifiers for public release tags and update notices. */
export function isReleaseVersion(value: string): boolean {
  return (
    value.length <= 64 &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  );
}
export function compareReleaseVersions(a: string, b: string): number {
  if (!isReleaseVersion(a) || !isReleaseVersion(b))
    throw new Error("Use a canonical stable X.Y.Z release version");
  const left = a.split(".").map(BigInt),
    right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++)
    if (left[i] !== right[i])
      return (left[i] ?? 0n) > (right[i] ?? 0n) ? 1 : -1;
  return 0;
}
