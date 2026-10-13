import {
  access,
  lstat,
  mkdir,
  readdir,
  readlink,
  symlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
export async function linkSkills(
  sourceRoot: string,
  targetRoot: string,
): Promise<void> {
  const source = join(resolve(sourceRoot), "skills");
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "shared") continue;
    const from = join(source, entry.name);
    await access(join(from, "SKILL.md"));
    for (const directory of [".claude/skills", ".agents/skills"]) {
      const parent = join(resolve(targetRoot), directory);
      await mkdir(parent, { recursive: true });
      const target = join(parent, entry.name);
      const old = await lstat(target).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (old) {
        if (
          old.isSymbolicLink() &&
          resolve(parent, await readlink(target)) === from
        )
          continue;
        throw new Error(`Existing skill conflict: ${target}; preserved`);
      }
      await symlink(from, target, "dir");
    }
  }
}
