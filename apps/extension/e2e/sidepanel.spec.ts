import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./fixtures";

// The build points at http://127.0.0.1:8010 by default (see wxt.config.ts).
const PORT = 8010;

function startFakeBackend(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "0.0.0-test", database: "ok" }));
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => {
      expect((server.address() as AddressInfo).port).toBe(PORT);
      resolve(server);
    });
  });
}

test("side panel shows the localized UI and a connected backend", async ({ context, extensionId }) => {
  const server = await startFakeBackend();
  try {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(page.getByRole("heading", { name: "Exponent Fill" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Connected");
    await expect(page.getByText("Ready")).toBeVisible();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("side panel reports an unreachable backend instead of failing silently", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await expect(page.getByRole("status")).toContainText(/Unreachable|No response/);
  await expect(page.getByRole("button", { name: "Check again" })).toBeEnabled();
});

test("the manifest declares no broad host access at install time", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/manifest.json`);
  const manifest = JSON.parse(await page.locator("body").innerText()) as {
    permissions?: string[];
    host_permissions?: string[];
    optional_host_permissions?: string[];
    content_scripts?: unknown[];
  };

  expect(manifest.permissions).not.toContain("debugger");
  expect(manifest.permissions).not.toContain("tabs");
  expect(manifest.host_permissions).toEqual(["http://127.0.0.1:8010/*"]);
  expect(manifest.host_permissions).not.toContain("<all_urls>");
  expect(manifest.content_scripts ?? []).toHaveLength(0);
  expect(manifest.optional_host_permissions).toEqual(["https://*/*", "http://*/*"]);
});
