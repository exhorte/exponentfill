import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setFetch } from "./api";
import { en, errorMessage, fr, translate } from "./i18n";
import { I18nProvider, TrustBadge } from "./lib";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fact = {
  id: "1", key: "personal.first_name", category: "personal", group_id: null, value: "Awa", masked: false, value_type: "text", origin: "declared", verification_level: "none",
  validation_status: "validated", sensitivity: "normal", ai_shareable: false, confidence: null, trust_class: "declared", usable: true, has_open_conflict: false, sources_count: 0,
  entered_at: "t", extracted_at: null, validated_at: "t", updated_at: "t", version: 1, seq: 1, deleted: false,
};

beforeEach(() => {
  vi.stubGlobal("document", { cookie: "ef_csrf=abc%20123; other=1" });
});

describe("API client", () => {
  it("validates every answer against its schema", async () => {
    setFetch(async () => json({ items: [fact], seq: 1 }));
    expect((await api.facts()).items[0]?.key).toBe("personal.first_name");
    setFetch(async () => json({ items: [{ ...fact, trust_class: "certified" }], seq: 1 }));
    await expect(api.facts()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("sends the CSRF header on writes only, and credentials stay same-origin", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    setFetch(async (url, init) => { calls.push({ url: String(url), init: init ?? {} }); return String(url).endsWith("/facts") ? json({ items: [fact], seq: 1 }) : json(fact); });
    await api.facts();
    await api.patchFact("1", 1, "Awa Marie");
    expect((calls[0]?.init.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
    expect((calls[1]?.init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("abc 123");
    expect(calls.every((c) => c.init.credentials === "same-origin")).toBe(true);
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ base_version: 1, value: "Awa Marie" });
  });

  it("turns API errors and network failures into ApiError with the server's code", async () => {
    setFetch(async () => json({ error: { code: "stale_version", message: "changed", details: { current_version: 3 } } }, 409));
    await expect(api.patchFact("1", 1, "x")).rejects.toMatchObject({ status: 409, code: "stale_version", details: { current_version: 3 } });
    setFetch(async () => { throw new TypeError("offline"); });
    await expect(api.facts()).rejects.toBeInstanceOf(ApiError);
    await expect(api.facts()).rejects.toMatchObject({ code: "network" });
  });

  it("handles 204 answers", async () => {
    setFetch(async () => new Response(null, { status: 204 }));
    await expect(api.logout()).resolves.toBeUndefined();
  });
});

describe("TrustBadge never shows 'Verified' without proof", () => {
  const render = (f: Parameters<typeof TrustBadge>[0]["fact"]) => renderToString(<I18nProvider><TrustBadge fact={f} /></I18nProvider>);
  it("shows Verified only for a validated fact with a verification level", () => {
    expect(render({ trust_class: "verified", validation_status: "validated", verification_level: "user_confirmed", origin: "extracted" })).toContain('data-trust="verified"');
    const lying = render({ trust_class: "verified", validation_status: "pending_review", verification_level: "none", origin: "extracted" });
    expect(lying).not.toContain('data-trust="verified"');
    expect(lying).toContain('data-trust="extracted"');
  });
});

describe("i18n", () => {
  it("English and French define exactly the same keys, all non-empty", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(fr)) expect(v.trim(), k).not.toBe("");
  });
  it("maps known API error codes, falls back to a generic message", () => {
    expect(errorMessage("fr", "invalid_credentials")).toBe(translate("fr", "err_invalid_credentials"));
    expect(errorMessage("en", "something_unknown")).toBe(translate("en", "error"));
  });
});
