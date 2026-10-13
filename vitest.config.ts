import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { coveragePolicy } from "./tools/standards/src/coverage-policy.ts";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: [
      fileURLToPath(
        new URL("./apps/desktop/tests/coverage-setup.ts", import.meta.url),
      ),
    ],
    include: [
      "tools/*/tests/**/*.test.ts",
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
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
      ],
      exclude: ["**/*.d.ts", "**/*.test.ts"],
      thresholds: coveragePolicy,
    },
  },
});
