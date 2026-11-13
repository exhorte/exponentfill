import {
  ExtensionRequestSchema,
  type ExtensionResponse,
  type HealthCheckResult,
} from "@exponent-fill/shared-types";

export interface SenderLike {
  id?: string | undefined;
  /** URL of the frame that sent the message, as reported by the browser. */
  url?: string | undefined;
}

export interface HandlerDeps {
  /** `browser.runtime.id` */
  runtimeId: string;
  /** `browser.runtime.getURL("/")`, e.g. `chrome-extension://<id>/` */
  extensionOrigin: string;
  checkBackendHealth: () => Promise<HealthCheckResult>;
}

const REJECTED: ExtensionResponse = { ok: false, error: "rejected" };

/**
 * Single entry point for messages received by the service worker.
 *
 * Trust rules (SECURITY_ARCHITECTURE §5):
 * - the sender must be this extension;
 * - the sender URL, reported by the browser (never by page JavaScript), must be an
 *   extension page: content scripts report the web page URL, so they cannot reach
 *   UI-only handlers;
 * - the payload must match a known schema, otherwise it is rejected.
 */
export async function handleMessage(
  raw: unknown,
  sender: SenderLike,
  deps: HandlerDeps,
): Promise<ExtensionResponse> {
  if (sender.id !== deps.runtimeId) return REJECTED;
  if (typeof sender.url !== "string" || !sender.url.startsWith(deps.extensionOrigin)) {
    return REJECTED;
  }

  const parsed = ExtensionRequestSchema.safeParse(raw);
  if (!parsed.success) return REJECTED;

  switch (parsed.data.type) {
    case "health.check":
      return deps.checkBackendHealth();
  }
}
