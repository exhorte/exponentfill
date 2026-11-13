import "@/lib/zod-config"; // first: see the file
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { BACKEND_URL } from "@/lib/config";
import { handleMessage } from "@/lib/handler";
import { checkBackendHealth } from "@/lib/health";

// The service worker holds NO state in memory (it can be stopped after ~30 s of inactivity).
export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    void handleMessage(
      message,
      { id: sender.id, url: sender.url },
      {
        runtimeId: browser.runtime.id,
        extensionOrigin: browser.runtime.getURL("/"),
        checkBackendHealth: () => checkBackendHealth({ baseUrl: BACKEND_URL }),
      },
    ).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});
