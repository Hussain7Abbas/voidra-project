import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { coveragePolicy } from "./tools/standards/src/coverage-policy.ts";

// Native timing/coverage and the real distribution toolchain need an idle host.
export const exclusiveTestFiles: string[] = [
  "actions",
  "ai-bridge",
  "conflicts",
  "create",
  "gates",
  "git-history",
  "index",
  "knowledge",
  "knowledge-index",
  "native",
  "planning-commit",
  "profile",
  "queue",
  "releases",
  "review",
  "run-index",
  "undo-engine",
  "watcher",
]
  .map((name) => `apps/desktop/tests/${name}.test.ts`)
  .concat(
    "tools/skills-distribution/tests/sync.test.ts",
    "tools/run-engine/tests/release.test.ts",
  );

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    isolate: true,
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: {
          name: "isolated",
          include: [
            "tools/*/tests/**/*.test.ts",
            "packages/*/tests/**/*.test.ts",
            "apps/*/tests/**/*.test.ts",
          ],
          exclude: exclusiveTestFiles,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "exclusive",
          include: exclusiveTestFiles,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    setupFiles: [
      fileURLToPath(
        new URL("./apps/desktop/tests/coverage-setup.ts", import.meta.url),
      ),
    ],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      autoAttachSubprocess: true,
      excludeAfterRemap: true,
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "tools/*/src/**/*.ts",
        "packages/voidra/src/**/*.ts",
        "apps/desktop/src/**/*.{ts,tsx}",
        "apps/desktop/dist/**/*.cjs",
        ".cache/undo-native-*/scenario.cjs",
        ".cache/knowledge-native-*/scenario.cjs",
      ],
      exclude: ["**/*.d.ts", "**/*.test.ts"],
      thresholds: coveragePolicy,
    },
  },
});
