// Throwaway S3 service worker. Plain JS, no build. It only opens the panel and creates the offscreen document on request.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fromExtensionPage = sender.id === chrome.runtime.id && typeof sender.url === "string" &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
  if (!msg || msg.type !== "s3.ensure-offscreen") return false;
  if (!fromExtensionPage) { sendResponse({ ok: false, error: "rejected" }); return false; }
  (async () => {
    try {
      if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["BLOBS"], justification: "Spike S3: serve vault file chunks to a content script" });
      }
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false, error: String(e) }); }
  })();
  return true;
});
