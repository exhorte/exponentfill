import { MatchOutSchema, SyncOutSchema, SyncPushOutSchema, ApiErrorSchema, type MatchField } from "@exponent-fill/shared-types";
import type { Proposal } from "@exponent-fill/vault-domain";
import type { z } from "zod";

export type VaultErrorKind = "network" | "timeout" | "unauthorized" | "forbidden" | "http" | "invalid_response";

export class VaultError extends Error {
  constructor(
    readonly kind: VaultErrorKind,
    readonly status = 0,
    readonly code = "",
  ) {
    super(`${kind}${code ? `:${code}` : ""}`);
  }
}

/**
 * Talks to the backend with the DEVICE token (Bearer). No cookie, no ambient credential: the extension never sends the
 * user's web session. Answers are validated before they are trusted. The service is reached through host_permissions
 * (no CORS involved).
 */
export class VaultClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 8000,
  ) {}

  private async call<S extends z.ZodType>(schema: S, method: string, path: string, body?: unknown): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await this.fetchImpl(new URL(path, this.baseUrl), {
        method,
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new VaultError(e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "network");
    }
    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
      const code = parsed.success ? parsed.data.error.code : "";
      throw new VaultError(res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : "http", res.status, code);
    }
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new VaultError("invalid_response", res.status);
    return parsed.data;
  }

  /** Structure in, candidates out. No value of the page is ever sent. */
  match(fields: readonly MatchField[], revealSensitive = false) {
    return this.call(MatchOutSchema, "POST", "/v1/vault/match", { fields, reveal_sensitive: revealSensitive });
  }

  sync(since: number) {
    return this.call(SyncOutSchema, "GET", `/v1/vault/sync?since=${since}&limit=500`);
  }

  /** Offline proposals. The server makes them `pending_review`: a device only PROPOSES. */
  push(proposals: readonly Proposal[]) {
    const ops = proposals.map((p) => ({ op: "create" as const, client_id: p.client_id, key: p.key, value: p.value, group_id: p.group_id ?? null }));
    return this.call(SyncPushOutSchema, "POST", "/v1/vault/sync/push", { ops });
  }
}
