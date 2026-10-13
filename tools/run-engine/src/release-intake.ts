import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  checkProject,
  createReleaseAction,
  releaseCandidates,
  schemas,
} from "voidra";
import { z } from "zod";
import { readGitIdentity } from "./git.ts";

const selection = z.strictObject({
  ids: z.array(schemas.action.shape.id).optional(),
});
export async function startRelease(
  root: string,
  raw: z.input<typeof selection> = {},
): Promise<{ action: string | null; queued: boolean }> {
  const input = selection.parse(raw),
    execute = promisify(execFile);
  const top = await execute("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
  }).catch(() => null);
  if (!top || (await realpath(top.stdout.trim())) !== (await realpath(root)))
    throw new Error("Start a release from the project Git root");
  const identity = await readGitIdentity(root);
  if (!identity.value)
    throw new Error("Configure Git name and email before starting a release");
  const candidates = releaseCandidates(await checkProject(root));
  if (input.ids && new Set(input.ids).size !== input.ids.length)
    throw new Error("Duplicate release selection");
  const selected = input.ids
    ? input.ids.map((id) => {
        const candidate = candidates.find((candidate) => candidate.id === id);
        if (!candidate)
          throw new Error("Select only completed, unreleased work");
        return candidate;
      })
    : candidates;
  if (!selected.length) return { action: null, queued: false };
  const action = await createReleaseAction(root, {
    actions: selected.map(({ id, revision }) => ({ id, revision })),
    by: identity.value,
    queue: true,
  });
  return { action, queued: true };
}
export async function runRelease(
  args: string[],
  cwd: string,
): Promise<{ code: number; value: unknown }> {
  try {
    if (args.includes("--help"))
      return {
        code: 0,
        value: {
          help: "Start a local Release action: --project FOLDER [--report FILE containing optional ids]. Creates/queues completed work only; no commit, tag or publishing.",
        },
      };
    let root = cwd,
      report: string | undefined;
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index],
        value = args[index + 1];
      if (
        !flag ||
        !value ||
        !["--project", "--report"].includes(flag) ||
        seen.has(flag)
      )
        throw new Error("Invalid release option");
      seen.add(flag);
      if (flag === "--project") root = resolve(cwd, value);
      else report = value;
    }
    return {
      code: 0,
      value: await startRelease(
        root,
        report ? JSON.parse(await readFile(resolve(root, report), "utf8")) : {},
      ),
    };
  } catch (error) {
    return {
      code: 1,
      value: {
        error: error instanceof Error ? error.message : "Release intake failed",
      },
    };
  }
}
