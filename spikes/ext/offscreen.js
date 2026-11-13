// S6 variant (d): the long fetch runs in an offscreen document; progress goes back to the panel by runtime messages.
chrome.runtime.onMessage.addListener((m, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!m || m.type !== "s6.off-run") return;
  run(m.url);
});

async function run(url) {
  const t0 = performance.now();
  let events = 0, last = t0, maxGap = 0, error = null, nextReport = 30000;
  try {
    const res = await fetch(url);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const now = performance.now();
      events += (dec.decode(value, { stream: true }).match(/data:/g) || []).length;
      maxGap = Math.max(maxGap, now - last);
      last = now;
      if (now - t0 > nextReport) {
        chrome.runtime.sendMessage({ type: "s6.off-progress", data: { elapsedS: Math.round((now - t0) / 1000), events } }).catch(() => {});
        nextReport += 30000;
      }
    }
  } catch (e) { error = String(e); }
  chrome.runtime.sendMessage({
    type: "s6.off-done",
    data: { elapsedS: Math.round((performance.now() - t0) / 1000), events, maxGapS: Math.round(maxGap / 100) / 10, error },
  }).catch(() => {});
}
