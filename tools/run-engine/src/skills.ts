import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseRecord } from "../../../packages/voidra/src/records.ts";
export async function lintSkills(root: string): Promise<string[]> {
  const errors: string[] = [],
    directory = join(root, "skills");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "shared") continue;
    const path = join(directory, entry.name, "SKILL.md");
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch {
      errors.push(`${entry.name}: missing SKILL.md`);
      continue;
    }
    try {
      const record = parseRecord(path, content);
      if (
        record.data.name !== entry.name ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)
      )
        errors.push(`${entry.name}: name must match its folder`);
      if (
        typeof record.data.description !== "string" ||
        !record.data.description.trim()
      )
        errors.push(`${entry.name}: description is required`);
      if (content.split("\n").length > 300)
        errors.push(`${entry.name}: keep SKILL.md below 300 lines`);
      if (/TODO: fill in|\[INSERT|\[TODO/i.test(content))
        errors.push(`${entry.name}: unfinished scaffold`);
      for (const match of record.body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1]?.split("#")[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        try {
          await access(resolve(directory, entry.name, target));
        } catch {
          errors.push(`${entry.name}: missing relative resource ${target}`);
        }
      }
    } catch (error) {
      errors.push(
        `${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return errors;
}
