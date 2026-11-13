// Throwaway spike server. Zero dependencies (Node >= 22). Not part of the product.
//
// Serves the same static content under ANY host name that resolves to this machine, so one
// process provides several origins for the permission spike (S2):
//   http://localhost:5800   http://127.0.0.1:5800   http://a.localhost:5800   http://b.localhost:5800 ...
// (Chrome resolves *.localhost to loopback by itself; no hosts-file edit is needed.)
//
//   /            -> spikes/fixtures        (plain HTML fixtures)
//   /fx/         -> spikes/frameworks/dist (built framework fixtures, if present)
//   /gen/file    -> deterministic pseudo-random bytes: /gen/file?mb=10&seed=1 (test asset, see sha256 header)
//   /whoami      -> JSON with the Host header (to see which origin answered)
//
// Binds to 127.0.0.1 only. Usage: node spikes/server/serve.mjs [port]

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = resolve(here, "../fixtures");
const FRAMEWORKS = resolve(here, "../frameworks/dist");
const PORT = Number(process.argv[2] ?? process.env.SPIKE_PORT ?? 5800);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

/** Deterministic pseudo-random bytes (xorshift32) so a page and a test can compare SHA-256. */
function generate(bytes, seed) {
  const out = Buffer.allocUnsafe(bytes);
  let x = (seed >>> 0) || 1;
  for (let i = 0; i < bytes; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

async function serveFile(root, relPath, res) {
  const target = normalize(join(root, relPath));
  if (target !== root && !target.startsWith(root + sep)) return notFound(res);
  let file = target;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    notFound(res);
  }
}

function notFound(res) {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://spike.invalid");
  const path = decodeURIComponent(url.pathname);

  if (path === "/whoami") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ host: req.headers.host ?? null, now: new Date().toISOString() }));
    return;
  }
  if (path === "/gen/file") {
    const mb = Math.min(Math.max(Number(url.searchParams.get("mb") ?? 1), 0.001), 64);
    const seed = Number(url.searchParams.get("seed") ?? 1);
    const body = generate(Math.round(mb * 1024 * 1024), seed);
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": body.length,
      "content-disposition": `attachment; filename="spike-${mb}mb-seed${seed}.bin"`,
      "x-sha256": createHash("sha256").update(body).digest("hex"),
      "cache-control": "no-store",
    });
    res.end(body);
    return;
  }
  if (path.startsWith("/fx/")) return serveFile(FRAMEWORKS, path.slice(4), res);
  return serveFile(FIXTURES, path === "/" ? "index.html" : path.slice(1), res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[spike-server] http://localhost:${PORT}  (fixtures: ${FIXTURES})`);
});
