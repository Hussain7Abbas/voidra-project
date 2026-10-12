/** Shared coverage gates; UI components intentionally have no percentage target. */
export const coveragePolicy = {
  "packages/voidra/src/**": { lines: 90 },
  "apps/desktop/src/main/**": { lines: 80 },
  "apps/desktop/src/project-service/**": { lines: 80 },
  "tools/*/src/**": { lines: 90 },
} as const;
