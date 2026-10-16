import { defineConfig } from "@playwright/test";

// Substitute only the external application launch; keep real IPC, clipboard and files.
process.env.VOIDRA_TEST_AGENT_LAUNCH = "1";
process.env.VOIDRA_TEST_BACKGROUND ??= "1";
export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
