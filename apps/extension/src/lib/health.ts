import { HealthResponseSchema, type HealthCheckResult } from "@exponent-fill/shared-types";

export interface HealthOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Asks the backend for its health. Never throws: every failure is mapped to a
 * typed result, and the payload is validated before it is trusted.
 */
export async function checkBackendHealth({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 3000,
}: HealthOptions): Promise<HealthCheckResult> {
  let response: Response;
  try {
    response = await fetchImpl(new URL("/health", baseUrl), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: "unreachable" };
  }

  if (!response.ok) return { ok: false, error: "unreachable" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "invalid_response" };
  }

  const parsed = HealthResponseSchema.safeParse(payload);
  return parsed.success
    ? { ok: true, health: parsed.data }
    : { ok: false, error: "invalid_response" };
}
