import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { markdown, samples } from "./samples.ts";
export function baseFiles(): Map<string, Buffer> {
  return new Map(
    Object.entries({
      ".voidra/voidra.json": JSON.stringify(samples.project),
      ".voidra/README.md": "# Guide\n",
      ".voidra/.gitignore": "local/\n",
      ".voidra/actions/act-000000/action.md": markdown(samples.action),
    }).map(([path, raw]) => [path, Buffer.from(raw)]),
  );
}
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
export async function materialize(files = baseFiles()): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voidra-test-"));
  folders.push(root);
  for (const [file, raw] of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), raw);
  }
  return root;
}
