import { hash } from "./lifecycle.ts";
import type { ProjectInspection } from "./project.ts";
import { readProjectRelease } from "./project-release.ts";
import {
  type ReleasePreparation,
  releasePreparationSchema,
} from "./release-preparation-schema.ts";
import { schemas } from "./schemas.ts";

/** Exact ticket subset authorized by the shown current version and selected Done work. */
export function releaseVersionTickets(
  project: ProjectInspection,
  ids: string[],
  version: string,
): { id: string; revision: string }[] {
  return ids
    .flatMap((id) => {
      const record = project.records.get(`.voidra/actions/${id}/action.md`);
      if (!record || record.document.data.targetRelease !== version) return [];
      return [{ id, revision: hash(record.document.raw) }];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
export async function checkReleasePreparation(
  root: string,
  project: ProjectInspection,
  preparation: ReleasePreparation,
  ids: string[],
): Promise<void> {
  const input = releasePreparationSchema.parse(preparation),
    source = await readProjectRelease(root);
  if (
    source.path !== input.source.path ||
    source.version !== input.source.version ||
    source.revision !== input.source.revision
  )
    throw Error("Release version source changed; refresh the release proposal");
  const before = input.source.version.split(".").map(BigInt),
    after = input.version.split(".").map(BigInt);
  let direction = 0;
  for (let i = 0; i < 3 && !direction; i++)
    direction =
      (after[i] ?? 0n) > (before[i] ?? 0n)
        ? 1
        : (after[i] ?? 0n) < (before[i] ?? 0n)
          ? -1
          : 0;
  if (direction <= 0)
    throw Error("The new release must follow the current version");
  const expected = releaseVersionTickets(project, ids, source.version),
    actual = [...input.tickets].sort((a, b) => a.id.localeCompare(b.id));
  if (
    JSON.stringify(expected) !==
    JSON.stringify(actual.map(({ id, revision }) => ({ id, revision })))
  )
    throw Error(
      "Done-ticket release scope changed; refresh the exact ticket choice",
    );
  for (const id of ids) {
    const record = project.records.get(`.voidra/actions/${id}/action.md`);
    if (!record || !schemas.action.safeParse(record.document.data).success)
      throw Error("Release member is missing or invalid");
  }
}
