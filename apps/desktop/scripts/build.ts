import { execFileSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { build } from "esbuild";

execFileSync(process.execPath, ["../../tools/run-engine/scripts/native.ts"], {
  stdio: "inherit",
});

const common = {
  bundle: true,
  platform: "node" as const,
  format: "cjs" as const,
  target: "node24",
  sourcemap: "inline" as const,
  external: ["electron", "better-sqlite3"],
  define: { "import.meta.url": "__voidraModuleURL" },
  banner: {
    js: "const __voidraModuleURL=require('node:url').pathToFileURL(__filename).href;const __voidraProcessHelper=require('node:path').join(__dirname.replace(/app\\.asar(?=\\/|$)/,'app.asar.unpacked'),'process-info');",
  },
};
await build({
  ...common,
  entryPoints: ["src/main/index.ts"],
  outfile: "dist/main.cjs",
});
await build({
  ...common,
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist/preload.cjs",
  banner: { js: "" },
});
await build({
  ...common,
  entryPoints: ["src/project-service/index.ts"],
  outfile: "dist/project-service.cjs",
});

await copyFile(
  "../../skills/voidra-go/scripts/process-info",
  "dist/process-info",
);
