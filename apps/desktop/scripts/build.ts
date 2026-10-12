import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node" as const,
  format: "cjs" as const,
  target: "node24",
  sourcemap: "inline" as const,
  external: ["electron", "better-sqlite3"],
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
});
await build({
  ...common,
  entryPoints: ["src/project-service/index.ts"],
  outfile: "dist/project-service.cjs",
});
