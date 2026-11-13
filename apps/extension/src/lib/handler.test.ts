import { describe, expect, it, vi } from "vitest";
import type { HealthCheckResult } from "@exponent-fill/shared-types";
import { handleMessage, type HandlerDeps } from "./handler";

const RUNTIME_ID = "abcdefghijklmnopabcdefghijklmnop";
const ORIGIN = `chrome-extension://${RUNTIME_ID}/`;

const okResult: HealthCheckResult = {
  ok: true,
  health: { status: "ok", version: "0.0.0", database: "unconfigured" },
};

function makeDeps(): HandlerDeps & { checkBackendHealth: ReturnType<typeof vi.fn> } {
  return {
    runtimeId: RUNTIME_ID,
    extensionOrigin: ORIGIN,
    checkBackendHealth: vi.fn(async () => okResult),
  };
}

describe("handleMessage", () => {
  it("answers a health.check coming from an extension page", async () => {
    const deps = makeDeps();
    const response = await handleMessage(
      { type: "health.check" },
      { id: RUNTIME_ID, url: `${ORIGIN}sidepanel.html` },
      deps,
    );
    expect(response).toEqual(okResult);
    expect(deps.checkBackendHealth).toHaveBeenCalledTimes(1);
  });

  it("rejects a message from another extension", async () => {
    const deps = makeDeps();
    const response = await handleMessage(
      { type: "health.check" },
      { id: "someotherextensionidsomeotherext", url: `${ORIGIN}sidepanel.html` },
      deps,
    );
    expect(response).toEqual({ ok: false, error: "rejected" });
    expect(deps.checkBackendHealth).not.toHaveBeenCalled();
  });

  it("rejects a message sent from a web page context (e.g. a content script)", async () => {
    const deps = makeDeps();
    const response = await handleMessage(
      { type: "health.check" },
      { id: RUNTIME_ID, url: "https://evil.example/checkout" },
      deps,
    );
    expect(response).toEqual({ ok: false, error: "rejected" });
    expect(deps.checkBackendHealth).not.toHaveBeenCalled();
  });

  it("rejects a sender whose URL merely starts like the extension origin", async () => {
    const deps = makeDeps();
    const response = await handleMessage(
      { type: "health.check" },
      { id: RUNTIME_ID, url: `https://chrome-extension://${RUNTIME_ID}/` },
      deps,
    );
    expect(response).toEqual({ ok: false, error: "rejected" });
  });

  it("rejects a sender without a URL", async () => {
    const deps = makeDeps();
    const response = await handleMessage({ type: "health.check" }, { id: RUNTIME_ID }, deps);
    expect(response).toEqual({ ok: false, error: "rejected" });
  });

  it("rejects malformed payloads", async () => {
    const deps = makeDeps();
    const sender = { id: RUNTIME_ID, url: `${ORIGIN}sidepanel.html` };
    for (const raw of [undefined, null, "health.check", { type: "submit.form" }, { type: "health.check", x: 1 }]) {
      expect(await handleMessage(raw, sender, deps)).toEqual({ ok: false, error: "rejected" });
    }
    expect(deps.checkBackendHealth).not.toHaveBeenCalled();
  });
});
