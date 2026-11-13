// Throwaway S3 server (port 5821): serves ./pages and a deterministic byte generator. Zero dependencies. Binds to 127.0.0.1.
//   node spikes/ext-s3/server.mjs [port]      GET /gen/file?mb=10&seed=1  -> bytes + x-sha256 header
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "pages");
const PORT = Number(process.argv[2] ?? 5821);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };

function generate(bytes, seed) {
  const out = Buffer.allocUnsafe(bytes);
  let x = (seed >>> 0) || 1;
  for (let i = 0; i < bytes; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = x & 0xff; }
  return out;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://spike.invalid");
  const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "x-sha256", "cache-control": "no-store" };
  if (url.pathname === "/gen/file") {
    const mb = Math.min(Math.max(Number(url.searchParams.get("mb") ?? 1), 0.001), 128);
    const body = generate(Math.round(mb * 1024 * 1024), Number(url.searchParams.get("seed") ?? 1));
    res.writeHead(200, { ...cors, "content-type": "application/octet-stream", "content-length": body.length, "x-sha256": createHash("sha256").update(body).digest("hex") });
    res.end(body);
    return;
  }
  const target = normalize(join(root, url.pathname === "/" ? "upload-all.html" : url.pathname.slice(1)));
  if (!target.startsWith(root + sep)) { res.writeHead(404); res.end(); return; }
  try {
    const body = await readFile(target);
    res.writeHead(200, { ...cors, "content-type": MIME[extname(target)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404, cors); res.end("not found"); }
}).listen(PORT, "127.0.0.1", () => console.log(`[s3-server] http://localhost:${PORT}`));
