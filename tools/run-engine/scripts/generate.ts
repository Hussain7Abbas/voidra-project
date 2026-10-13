import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const files: { path: string; bytes: Buffer }[] = [];
for (const [skill, entry, script] of [
  ["voidra-go", "cli-entry.ts", "runtime.mjs"],
  ["voidra-plan", "cli-entry.ts", "runtime.mjs"],
  ["voidra-init", "init-cli.ts", "init.mjs"],
  ["voidra-architect-general", "architecture-cli.ts", "architecture.mjs"],
]) {
  const output = resolve(root, `skills/${skill}/scripts/${script}`);
  const result = await build({
    absWorkingDir: root,
    entryPoints: [`tools/run-engine/src/${entry}`],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    write: false,
    minify: false,
    alias: { voidra: resolve(root, "packages/voidra/src/index.ts") },
    banner: {
      js: "// Generated from tools/run-engine. AGPL-3.0-or-later; bundled dependency notices are in references/third-party-notices.txt.\nimport { createRequire as __voidraCreateRequire } from 'node:module'; import { fileURLToPath as __voidraFileURL } from 'node:url'; const require = __voidraCreateRequire(import.meta.url); const __voidraProcessHelper=__voidraFileURL(new URL('./process-info',import.meta.url)); const __voidraIntakeTemplates=__voidraFileURL(new URL('../references/templates/',import.meta.url));",
    },
  });
  const bytes = result.outputFiles?.[0]?.contents;
  if (!bytes) throw new Error("No skill bundle");
  files.push(
    { path: output, bytes: Buffer.from(bytes) },
    {
      path: resolve(root, `skills/${skill}/references/format.md`),
      bytes: await readFile(
        resolve(root, "skills/shared/references/format.md"),
      ),
    },
  );
}
for (const folder of await readdir(resolve(root, "templates"), {
  withFileTypes: true,
})) {
  if (!folder.isDirectory()) continue;
  for (const skill of ["voidra-init", "voidra-go", "voidra-plan"])
    files.push({
      path: resolve(
        root,
        `skills/${skill}/references/templates/${folder.name}/template.yaml`,
      ),
      bytes: await readFile(
        resolve(root, `templates/${folder.name}/template.yaml`),
      ),
    });
}
for (const file of files) {
  if (process.argv.includes("--check")) {
    const old = await readFile(file.path).catch(() => null);
    if (!old?.equals(file.bytes))
      throw new Error(
        "Skill runtime/reference/template is missing or stale; run make gen",
      );
  } else {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.bytes);
  }
}
const templateCopies = resolve(root, "skills/voidra-init/references/templates");
const expected = new Set(files.map((file) => file.path));
async function checkCopies(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await checkCopies(path);
    else if (!expected.has(path))
      throw new Error(`Orphan generated template copy: ${path}`);
  }
}
await checkCopies(templateCopies);

for (const name of [
  "runtime.md",
  "discovery.md",
  "plan.md",
  "research.md",
  "third-party-notices.txt",
]) {
  const bytes = await readFile(
    resolve(root, `skills/voidra-go/references/${name}`),
  );
  const path = resolve(root, `skills/voidra-plan/references/${name}`);
  if (process.argv.includes("--check")) {
    const old = await readFile(path).catch(() => null);
    if (!old?.equals(bytes))
      throw new Error("Planning guide is missing or stale; run make gen");
  } else await writeFile(path, bytes);
}
