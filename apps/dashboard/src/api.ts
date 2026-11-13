import {
  AiPreviewSchema,
  ApiErrorSchema,
  AuditEventSchema,
  AuthOutSchema,
  ConflictSchema,
  DeviceOutSchema,
  DocumentSchema,
  DocumentTextSchema,
  FactListSchema,
  FactSchema,
  PrivacySchema,
  ReviewSchema,
  SessionListItemSchema,
  SourceSchema,
  UserSchema,
  VersionSchema,
} from "@exponent-fill/shared-types";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function csrf(): string {
  const m = /(?:^|;\s*)ef_csrf=([^;]+)/.exec(document.cookie);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests inject a fake. */
export function setFetch(f: Fetch): void {
  fetchImpl = f;
}

/** Every response is validated against its zod schema: a malformed answer is an error, never silently trusted. */
async function core(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (method !== "GET") headers["X-CSRF-Token"] = csrf();
  let res: Response;
  try {
    res = await fetchImpl(path, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network", "The server cannot be reached.");
  }
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
    throw new ApiError(res.status, "http_error", `HTTP ${res.status}`);
  }
  return res;
}

export async function request<S extends z.ZodType>(schema: S, method: string, path: string, body?: unknown): Promise<z.infer<S>> {
  const res = await core(method, path, body);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new ApiError(res.status, "invalid_response", "The server answered with an unexpected shape.");
  return parsed.data;
}

/** For calls that answer 204 / no body. */
export async function send(method: string, path: string, body?: unknown): Promise<void> {
  await core(method, path, body);
}

const Str = z.object({ status: z.string() });
const Revealed = z.object({ value: z.union([z.string(), z.boolean()]).nullable() });
const Verify = z.object({ valid: z.boolean(), events: z.number(), broken_at: z.number().nullable() });
const Registry = z.array(z.object({ key: z.string(), category: z.string(), value_type: z.string(), multiple: z.boolean(), sensitive: z.boolean(), grouped: z.boolean() }));
const Deletion = z.object({ deletion_scheduled_for: z.string() });

export const api = {
  register: (email: string, password: string, display_name: string, locale: string) => request(AuthOutSchema, "POST", "/v1/auth/register", { email, password, display_name, locale }),
  login: (email: string, password: string) => request(AuthOutSchema, "POST", "/v1/auth/login", { email, password }),
  logout: () => send("POST", "/v1/auth/logout"),
  session: () => request(AuthOutSchema, "GET", "/v1/auth/session"),
  resetRequest: (email: string) => request(Str, "POST", "/v1/auth/password-reset/request", { email }),
  resetConfirm: (token: string, new_password: string) => send("POST", "/v1/auth/password-reset/confirm", { token, new_password }),
  changePassword: (current_password: string, new_password: string) => send("POST", "/v1/auth/password/change", { current_password, new_password }),
  sessions: () => request(z.array(SessionListItemSchema), "GET", "/v1/auth/sessions"),
  revokeSession: (id: string) => send("DELETE", `/v1/auth/sessions/${id}`),
  createDevice: (label: string, scopes: string[]) => request(DeviceOutSchema, "POST", "/v1/auth/devices", { label, scopes }),
  account: () => request(UserSchema, "GET", "/v1/account"),
  patchAccount: (body: { display_name?: string; locale?: string; email?: string }) => request(UserSchema, "PATCH", "/v1/account", body),
  deleteAccount: (password: string) => request(Deletion, "DELETE", "/v1/account", { password }),
  cancelDeletion: () => send("POST", "/v1/account/deletion/cancel"),
  privacy: () => request(PrivacySchema, "GET", "/v1/privacy"),
  putPrivacy: (p: z.infer<typeof PrivacySchema>) => request(PrivacySchema, "PUT", "/v1/privacy", p),
  aiPreview: (purpose: string) => request(AiPreviewSchema, "POST", "/v1/privacy/ai-preview", { purpose }),
  registry: () => request(Registry, "GET", "/v1/vault/registry"),
  facts: (query = "") => request(FactListSchema, "GET", `/v1/vault/facts${query}`),
  createFact: (key: string, value: string | boolean, group_id?: string | null) => request(FactSchema, "POST", "/v1/vault/facts", { key, value, group_id: group_id ?? null }),
  patchFact: (id: string, base_version: number, value: string | boolean) => request(FactSchema, "PATCH", `/v1/vault/facts/${id}`, { base_version, value }),
  deleteFact: (id: string) => send("DELETE", `/v1/vault/facts/${id}`),
  validate: (id: string, base_version: number, with_document: boolean) => request(FactSchema, "POST", `/v1/vault/facts/${id}/validate`, { base_version, with_document }),
  reject: (id: string) => request(FactSchema, "POST", `/v1/vault/facts/${id}/reject`),
  reveal: (id: string) => request(Revealed, "POST", `/v1/vault/facts/${id}/reveal`),
  history: (id: string) => request(z.array(VersionSchema), "GET", `/v1/vault/facts/${id}/history`),
  sources: (id: string) => request(z.array(SourceSchema), "GET", `/v1/vault/facts/${id}/sources`),
  review: () => request(ReviewSchema, "GET", "/v1/vault/review"),
  conflicts: () => request(z.array(ConflictSchema), "GET", "/v1/vault/conflicts"),
  resolve: (id: string, keep: "a" | "b" | "dismiss") => send("POST", `/v1/vault/conflicts/${id}/resolve`, { keep }),
  documents: () => request(z.array(DocumentSchema), "GET", "/v1/vault/documents"),
  document: (id: string) => request(DocumentSchema, "GET", `/v1/vault/documents/${id}`),
  upload: (file: File) => {
    const f = new FormData();
    f.append("file", file);
    return request(DocumentSchema, "POST", "/v1/vault/documents", f);
  },
  replaceDocument: (id: string, file: File) => {
    const f = new FormData();
    f.append("file", file);
    return request(DocumentSchema, "PUT", `/v1/vault/documents/${id}/content`, f);
  },
  deleteDocument: (id: string, facts: string) => send("DELETE", `/v1/vault/documents/${id}?facts=${facts}`),
  documentText: (id: string) => request(DocumentTextSchema, "GET", `/v1/vault/documents/${id}/text`),
  documentFacts: (id: string) => request(z.array(FactSchema), "GET", `/v1/vault/documents/${id}/facts`),
  audit: () => request(z.array(AuditEventSchema), "GET", "/v1/audit/events?limit=100"),
  auditVerify: () => request(Verify, "GET", "/v1/audit/verify"),
};
