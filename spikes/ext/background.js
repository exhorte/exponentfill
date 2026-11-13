// Throwaway spike service worker. Plain JS, no build step (so it works offline and survives any toolchain change).
// Everything here is measurement code, not product code.

// ---- S1: side panel opens from the toolbar icon (a user gesture) ---------------------------------------------
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.warn("setPanelBehavior", e));

// ---- S1: typed message round trip with sender validation ------------------------------------------------------
// Only extension pages may talk to us; anything else is rejected. (Content scripts are NOT trusted here.)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Offscreen → panel progress messages are broadcast; they are not for the service worker.
  if (msg && typeof msg.type === "string" && msg.type.startsWith("s6.off-")) return false;
  const fromExtensionPage = sender.id === chrome.runtime.id && typeof sender.url === "string" &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
  if (!fromExtensionPage) {
    sendResponse({ ok: false, error: "rejected" });
    return false;
  }
  if (msg && msg.type === "s1.ping") {
    sendResponse({ ok: true, pong: msg.nonce, swStartedAt: SW_STARTED_AT, now: Date.now() });
    return false;
  }
  if (msg && msg.type === "s1.per-tab") {
    // S1: per-tab side panel. Enable the panel for one tab only, disable globally.
    (async () => {
      try {
        await chrome.sidePanel.setOptions({ enabled: false });
        await chrome.sidePanel.setOptions({ tabId: msg.tabId, path: "sidepanel.html", enabled: true });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async response
  }
  if (msg && msg.type === "s1.per-tab-reset") {
    (async () => {
      try {
        await chrome.sidePanel.setOptions({ enabled: true, path: "sidepanel.html" });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
  if (msg && msg.type === "s6.sw-fetch") {
    // S6 variant (a): fetch the stream straight from the service worker; report to the panel by messages it polls.
    runSwFetch(msg.url);
    sendResponse({ ok: true, started: true });
    return false;
  }
  if (msg && msg.type === "s6.sw-status") {
    sendResponse({ ok: true, status: swFetchStatus });
    return false;
  }
  if (msg && msg.type === "s6.offscreen-start") {
    // S6 variant (d): create the offscreen document if needed, then tell it to run the fetch.
    (async () => {
      try {
        if (!(await chrome.offscreen.hasDocument())) {
          await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["WORKERS"], justification: "Spike S6: long streaming fetch outside the service worker" });
        }
        await chrome.runtime.sendMessage({ type: "s6.off-run", url: msg.url });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
  sendResponse({ ok: false, error: "unknown-type" });
  return false;
});

const SW_STARTED_AT = Date.now();

// ---- S6 variant (a): long fetch inside the service worker -----------------------------------------------------
let swFetchStatus = { running: false, events: 0, firstAt: null, lastAt: null, error: null, doneAt: null, swRestarts: 0 };

async function runSwFetch(url) {
  swFetchStatus = { running: true, events: 0, firstAt: Date.now(), lastAt: null, error: null, doneAt: null, swStartedAt: SW_STARTED_AT };
  try {
    const res = await fetch(url);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = dec.decode(value, { stream: true });
      swFetchStatus.events += (text.match(/data:/g) || []).length;
      swFetchStatus.lastAt = Date.now();
    }
    swFetchStatus.running = false;
    swFetchStatus.doneAt = Date.now();
  } catch (e) {
    swFetchStatus.running = false;
    swFetchStatus.error = String(e);
  }
}

// ---- S6 variant (b): long-lived port from the side panel, with keep-alive pings --------------------------------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "s6-keepalive") return;
  // Only extension pages may connect.
  if (port.sender?.id !== chrome.runtime.id) { port.disconnect(); return; }
  const t = setInterval(() => { try { port.postMessage({ type: "s6.hb", now: Date.now(), swStartedAt: SW_STARTED_AT }); } catch { clearInterval(t); } }, 20000);
  port.onDisconnect.addListener(() => clearInterval(t));
  port.onMessage.addListener((m) => { if (m?.type === "s6.hb-ack") { /* receiving a message resets the idle timer */ } });
});
