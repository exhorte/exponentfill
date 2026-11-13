// S3 strategy "port-pull": the offscreen document owns the vault bytes; a content script connects and PULLS chunks.
// A pull model keeps every message small and bounded (backpressure for free) and lets the offscreen side free the bytes
// as soon as the port closes (cleanup of abandoned transfers).
import { CHUNK, getVaultFile, toBase64 } from "./vault-idb.js";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "s3-pull") return;
  let bytes = null;
  const timer = setTimeout(() => { bytes = null; try { port.disconnect(); } catch { /* already closed */ } }, 120000); // abandoned transfer TTL
  port.onMessage.addListener(async (m) => {
    try {
      if (m.type === "open") {
        const rec = await getVaultFile(m.key);
        if (!rec) { port.postMessage({ type: "error", error: "no-such-file" }); return; }
        bytes = new Uint8Array(await rec.blob.arrayBuffer());
        port.postMessage({ type: "meta", size: bytes.length, chunks: Math.ceil(bytes.length / CHUNK) });
      } else if (m.type === "get" && bytes) {
        port.postMessage({ type: "chunk", idx: m.idx, b64: toBase64(bytes.subarray(m.idx * CHUNK, (m.idx + 1) * CHUNK)) });
      } else if (m.type === "close") {
        bytes = null;
        port.disconnect();
      }
    } catch (e) { port.postMessage({ type: "error", error: String(e) }); }
  });
  port.onDisconnect.addListener(() => { clearTimeout(timer); bytes = null; });
});
