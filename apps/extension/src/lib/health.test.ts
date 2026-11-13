import { describe, expect, it } from "vitest";
import { checkBackendHealth } from "./health";

const baseUrl = "http://127.0.0.1:8010";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("checkBackendHealth", () => {
  it("returns the validated health payload", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ status: "ok", version: "0.0.0", database: "ok" })) as typeof fetch;
    expect(await checkBackendHealth({ baseUrl, fetchImpl })).toEqual({
      ok: true,
      health: { status: "ok", version: "0.0.0", database: "ok" },
    });
  });

  it("calls /health on the configured origin without credentials", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return jsonResponse({ status: "ok", version: "0.0.0", database: "ok" });
    }) as typeof fetch;
    await checkBackendHealth({ baseUrl, fetchImpl });
    expect(seenUrl).toBe("http://127.0.0.1:8010/health");
    expect(seenInit?.credentials).toBe("omit");
  });

  it("maps a network failure to unreachable", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await checkBackendHealth({ baseUrl, fetchImpl })).toEqual({ ok: false, error: "unreachable" });
  });

  it("maps a timeout to timeout", async () => {
    const fetchImpl = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as typeof fetch;
    expect(await checkBackendHealth({ baseUrl, fetchImpl })).toEqual({ ok: false, error: "timeout" });
  });

  it("maps a non-2xx status to unreachable", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    expect(await checkBackendHealth({ baseUrl, fetchImpl })).toEqual({ ok: false, error: "unreachable" });
  });

  it("rejects a payload that does not match the contract", async () => {
    const fetchImpl = (async () => jsonResponse({ status: "ok", version: "", database: "ok" })) as typeof fetch;
    expect(await checkBackendHealth({ baseUrl, fetchImpl })).toEqual({
      ok: false,
      error: "invalid_response",
    });
  });

  it("rejects a body that is not JSON", async () => {
    const fetchImpl = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    expect(await checkBackendHealth({ baseUrl, fetchImpl })).toEqual({
      ok: false,
      error: "invalid_response",
    });
  });
});
