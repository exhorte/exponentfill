// Throwaway fake "LLM provider" for spike S6 (long streaming call inside / next to the MV3 service worker).
// Zero dependencies. Not part of the product. A fake server does NOT reproduce a real provider's behaviour;
// it only reproduces the *timing* (long silences and long total duration).
//
//   GET /stream?total=300&gap=2&silence=0&silenceAt=30
//        Server-Sent Events. Emits one event every `gap` seconds for `total` seconds.
//        If silence > 0, emits nothing for `silence` seconds once `silenceAt` seconds have elapsed
//        (simulates a model "thinking" before the first or next token).
//   GET /health
//
// Every event is {"i": n, "elapsed": seconds}; the last one is {"done": true}.
// CORS is open on purpose: this server binds to 127.0.0.1 and exists only for the spike.
// Usage: node spikes/server/fake-llm.mjs [port]

import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? process.env.FAKE_LLM_PORT ?? 5810);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://spike.invalid");
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "cache-control": "no-store",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (url.pathname === "/health") {
    res.writeHead(200, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname !== "/stream") {
    res.writeHead(404, cors);
    res.end();
    return;
  }

  const total = clamp(Number(url.searchParams.get("total") ?? 300), 1, 1800);
  const gap = clamp(Number(url.searchParams.get("gap") ?? 2), 0.05, 120);
  const silence = clamp(Number(url.searchParams.get("silence") ?? 0), 0, 600);
  const silenceAt = clamp(Number(url.searchParams.get("silenceAt") ?? 30), 0, 1800);

  // headerDelay: seconds to wait BEFORE sending the response headers (a real provider may take a long time to "answer"
  // a request). The MV3 service worker rules treat "a fetch() whose response takes > 30 s to arrive" differently
  // from "a stream that started immediately and then goes quiet".
  const headerDelay = clamp(Number(url.searchParams.get("headerDelay") ?? 0), 0, 600);
  let closedEarly = false;
  req.on("close", () => { closedEarly = true; });
  console.log(`[fake-llm] request total=${total}s gap=${gap}s silence=${silence}s@${silenceAt}s headerDelay=${headerDelay}s`);
  setTimeout(() => { if (!closedEarly) startStream(); }, headerDelay * 1000);

  function startStream() {
  res.writeHead(200, { ...cors, "content-type": "text/event-stream", connection: "keep-alive" });
  const t0 = Date.now();
  let i = 0;
  let silenced = silence === 0;
  let silentUntil = 0;

  const timer = setInterval(() => {
    const elapsed = (Date.now() - t0) / 1000;
    if (!silenced && elapsed >= silenceAt) {
      silenced = true;
      silentUntil = elapsed + silence;
      console.log(`[fake-llm] entering ${silence}s silence at ${elapsed.toFixed(1)}s`);
    }
    if (elapsed < silentUntil) return;
    if (elapsed >= total) {
      res.write(`data: ${JSON.stringify({ done: true, elapsed })}\n\n`);
      clearInterval(timer);
      res.end();
      console.log(`[fake-llm] stream done after ${elapsed.toFixed(1)}s`);
      return;
    }
    res.write(`data: ${JSON.stringify({ i: i++, elapsed: Number(elapsed.toFixed(2)) })}\n\n`);
  }, gap * 1000);

  req.on("close", () => {
    clearInterval(timer);
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed < total) console.log(`[fake-llm] client closed early at ${elapsed.toFixed(1)}s`);
  });
  }
});

function clamp(n, lo, hi) {
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : lo;
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[fake-llm] http://127.0.0.1:${PORT}/stream`);
});
