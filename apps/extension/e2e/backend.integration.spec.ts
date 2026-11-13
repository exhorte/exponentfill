import { expect, test } from "./fixtures";

// Integration with the REAL backend (docker compose up -d db api).
// Skipped by default so `pnpm test:e2e` stays self-contained; enable with:
//   EF_E2E_REAL_BACKEND=1 pnpm exec playwright test e2e/backend.integration.spec.ts
test.skip(!process.env.EF_E2E_REAL_BACKEND, "set EF_E2E_REAL_BACKEND=1 with the docker stack running");

test("the built extension talks to the real backend and database", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await expect(page.getByRole("status")).toContainText("Connected");
  await expect(page.getByText("Ready")).toBeVisible();
});
