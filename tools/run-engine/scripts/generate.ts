import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = resolve(root, "skills/voidra-go/scripts/runtime.mjs");
const result = await build({
  absWorkingDir: root,
  entryPoints: ["tools/run-engine/src/cli-entry.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  write: false,
  minify: false,
  alias: { voidra: resolve(root, "packages/voidra/src/index.ts") },
  banner: {
    js: "// Generated from tools/run-engine. AGPL-3.0-or-later; bundled dependency notices are in references/third-party-notices.txt.\nimport { createRequire as __voidraCreateRequire } from 'node:module'; const require = __voidraCreateRequire(import.meta.url);",
  },
});
const bytes = result.outputFiles?.[0]?.contents;
if (!bytes) throw new Error("No runtime bundle");
const format = await readFile(
  resolve(root, "skills/shared/references/format.md"),
);
const files = [
  { path: output, bytes: Buffer.from(bytes) },
  {
    path: resolve(root, "skills/voidra-go/references/format.md"),
    bytes: format,
  },
];
for (const file of files) {
  if (process.argv.includes("--check")) {
    const old = await readFile(file.path).catch(() => null);
    if (!old?.equals(file.bytes))
      throw new Error(
        "Skill runtime/reference is missing or stale; run make gen",
      );
  } else await writeFile(file.path, file.bytes);
}
