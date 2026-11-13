import { defineConfig } from "@playwright/test";

// Deployment-model checks (ADR-024). Named *.e2e.ts so that Vitest (which runs *.test.* and *.spec.*) never picks them up.
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
