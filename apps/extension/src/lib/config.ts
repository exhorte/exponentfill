/**
 * Backend base URL. Must stay in sync with the default in wxt.config.ts, which
 * also derives the `host_permissions` entry from it. Never put secrets here.
 */
export const BACKEND_URL: string =
  (import.meta.env.WXT_BACKEND_URL as string | undefined) ?? "http://127.0.0.1:8010";
