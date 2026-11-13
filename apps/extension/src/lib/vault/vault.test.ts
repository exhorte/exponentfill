import { describe, expect, it } from "vitest";
import { VaultClient, VaultError } from "./client";
import { VaultService, type KeyValueStore } from "./service";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fact = (o: object = {}) => ({
  id: "f1", key: "personal.first_name", category: "personal", group_id: null, value: "Awa", masked: false, value_type: "text", origin: "declared", verification_level: "none",
  validation_status: "validated", sensitivity: "normal", ai_shareable: false, confidence: null, trust_class: "declared", usable: true, has_open_conflict: false, sources_count: 0,
  entered_at: "t", extracted_at: null, validated_at: "t", updated_at: "t", version: 1, seq: 1, deleted: false, ...o,
});
const memory = (): KeyValueStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, structuredClone(v)), remove: async (k) => void data.delete(k) };
};
const field = [{ id: "a", semantic_type: "first_name", kind: "text", required: false }];

describe("VaultClient", () => {
  it("authenticates with the device token only, never with cookies, and sends structure only", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const c = new VaultClient("http://127.0.0.1:8010", "efd_token", async (url, init) => { seen = { url: String(url), init: init ?? {} }; return json({ matches: [], seq: 0 }); });
    await c.match(field);
    expect(seen!.url).toBe("http://127.0.0.1:8010/v1/vault/match");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer efd_token");
    expect(seen!.init.credentials).toBe("omit");
    expect(JSON.parse(String(seen!.init.body))).toEqual({ fields: field, reveal_sensitive: false });
  });

  it("maps failures to typed errors and rejects malformed answers", async () => {
    const make = (f: typeof fetch) => new VaultClient("http://x", "t", f);
    await expect(make(async () => json({ error: { code: "unauthenticated", message: "x" } }, 401)).sync(0)).rejects.toMatchObject({ kind: "unauthorized", status: 401 });
    await expect(make(async () => json({ error: { code: "missing_scope", message: "x" } }, 403)).sync(0)).rejects.toMatchObject({ kind: "forbidden", code: "missing_scope" });
    await expect(make(async () => { throw new TypeError("down"); }).sync(0)).rejects.toMatchObject({ kind: "network" });
    await expect(make(async () => json({ seq: "nope" })).sync(0)).rejects.toMatchObject({ kind: "invalid_response" });
    expect(new VaultError("network")).toBeInstanceOf(Error);
  });
});

describe("VaultService", () => {
  const online = (calls: string[]) => async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${new URL(u).pathname}`);
    if (u.includes("/sync/push")) return json({ results: [{ client_id: "c1", status: "created" }], seq: 3 });
    if (u.includes("/sync?")) return json({ seq: 2, changes: [fact(), fact({ id: "f2", key: "contact.city", value: "Dakar" }), fact({ id: "s", sensitivity: "sensitive", masked: true, value: null })], more: false });
    return json({ matches: [{ field_id: "a", decision: "fill", reason: "usable", candidates: [{ fact_id: "f1", key: "personal.first_name", value: "Awa", trust_class: "declared", validation_status: "validated", usable: true, needs_confirmation: false, reason: "usable", sources_count: 0 }] }], seq: 2 });
  };

  it("refresh caches only usable, non-sensitive facts", async () => {
    const store = memory();
    const svc = new VaultService(new VaultClient("http://x", "t", online([])), store);
    const state = await svc.refresh();
    expect(Object.keys(state.facts).sort()).toEqual(["f1", "f2"]);
    expect(state.seq).toBe(2);
    expect(JSON.stringify([...store.data.values()])).not.toContain('"s"');
  });

  it("online: the server answers; offline: the cache answers conservatively; a refused token is reported", async () => {
    const store = memory();
    const calls: string[] = [];
    const svc = new VaultService(new VaultClient("http://x", "t", online(calls)), store);
    await svc.refresh();
    expect((await svc.match(field)).offline).toBe(false);
    const down = new VaultService(new VaultClient("http://x", "t", async () => { throw new TypeError("offline"); }), store);
    const off = await down.match(field);
    expect(off.offline).toBe(true);
    expect(off.matches[0]?.decision).toBe("fill");
    expect((await down.match([{ id: "z", semantic_type: "iban", kind: "text", required: false }])).matches[0]?.decision).toBe("none");
    const refused = new VaultService(new VaultClient("http://x", "t", async () => json({ error: { code: "unauthenticated", message: "x" } }, 401)), store);
    expect((await refused.match(field)).unauthorized).toBe(true);
  });

  it("queues proposals idempotently and flushes them when the service is back", async () => {
    const store = memory();
    let ids = 0;
    const calls: string[] = [];
    const svc = new VaultService(new VaultClient("http://x", "t", online(calls)), store, () => `c${++ids}`);
    expect(await svc.propose("contact.city", "Dakar")).toBe(1);
    expect(await svc.propose("contact.city", "Dakar")).toBe(1);
    const down = new VaultService(new VaultClient("http://x", "t", async () => { throw new TypeError("offline"); }), store);
    expect(await down.flush()).toBe(1); // still waiting
    expect(await svc.flush()).toBe(0);
    expect(calls).toContain("POST /v1/vault/sync/push");
  });
});
