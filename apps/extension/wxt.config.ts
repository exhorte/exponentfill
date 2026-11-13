import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// Must stay in sync with src/lib/config.ts (same default).
const backendUrl = process.env.WXT_BACKEND_URL ?? "http://127.0.0.1:8010";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    // Product name lives in public/_locales/*/messages.json (key: extName).
    // "Exponent Fill" is a working name (ADR-018): keep it changeable in ONE place.
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    // sidePanel.open() needs Chrome 116+; the final minimum is fixed after spike S1.
    minimum_chrome_version: "116",
    // Least privilege (ADR-004): no <all_urls> at install time.
    permissions: ["storage", "scripting", "activeTab"],
    // Site access is requested per site at runtime from the side panel (spike S2).
    optional_host_permissions: ["https://*/*", "http://*/*"],
    // Our own backend only.
    host_permissions: [`${new URL(backendUrl).origin}/*`],
    action: { default_title: "__MSG_extName__" },
  },
  hooks: {
    // WXT copies the `matches` of a runtime-registered content script into `host_permissions`,
    // which would grant https://*/* and http://*/* AT INSTALL TIME and defeat ADR-004.
    // Enforce the invariant here; e2e/sidepanel.spec.ts asserts it on the built manifest.
    "build:manifestGenerated": (_wxt, manifest) => {
      manifest.host_permissions = [`${new URL(backendUrl).origin}/*`];
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
