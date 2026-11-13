import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

/**
 * Loads the BUILT extension (`.output/chrome-mv3`) in Playwright's Chromium.
 * Chrome and Edge removed the command-line flags needed to side-load extensions, so tests
 * use the bundled Chromium with a persistent context (see Playwright's Chrome extensions docs).
 * A dedicated temporary profile is used: never the user's real profile.
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionPath = path.resolve(import.meta.dirname, "../.output/chrome-mv3");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ef-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
});

export { expect } from "@playwright/test";
