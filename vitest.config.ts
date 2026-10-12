import { defineConfig } from "vitest/config";
import { coveragePolicy } from "./tools/standards/src/coverage-policy.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tools/*/tests/**/*.test.ts",
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
    ],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "tools/*/src/**/*.ts",
        "packages/voidra/src/**/*.ts",
        "apps/desktop/src/**/*.{ts,tsx}",
      ],
      exclude: ["**/*.d.ts", "**/*.test.ts"],
      thresholds: coveragePolicy,
    },
  },
});
