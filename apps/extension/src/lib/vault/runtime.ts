import { browser } from "wxt/browser";
import { BACKEND_URL } from "@/lib/config";
import { VaultClient } from "./client";
import { VaultService, type KeyValueStore } from "./service";

const TOKEN_KEY = "ef.device.token";

/** `storage.local` is reachable from extension pages only for this purpose; a web page cannot read it. */
export const extensionStore: KeyValueStore = {
  async get(key) {
    return (await browser.storage.local.get(key))[key];
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await browser.storage.local.remove(key);
  },
};

export const getToken = async (): Promise<string | null> => {
  const t = await extensionStore.get(TOKEN_KEY);
  return typeof t === "string" && t.length > 0 ? t : null;
};
export const saveToken = (token: string) => extensionStore.set(TOKEN_KEY, token.trim());
export const clearToken = () => extensionStore.remove(TOKEN_KEY);

export async function openVault(): Promise<VaultService | null> {
  const token = await getToken();
  return token ? new VaultService(new VaultClient(BACKEND_URL, token), extensionStore) : null;
}
