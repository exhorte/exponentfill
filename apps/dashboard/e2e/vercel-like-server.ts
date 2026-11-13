import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

/**
 * A local stand-in for how Vercel serves the dashboard (ADR-024): it serves the BUILT `dist/` and applies the `headers` and the
 * `/v1` rewrite of the REAL `vercel.json` (read from disk, not copied), forwarding `/v1` to a backend. The only difference with
 * Vercel is that the rewrite's destination host is replaced by `backend`. Limits Vercel itself imposes (request-body size, timeouts)
 * are NOT reproduced here.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2" };

interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

export interface Rig {
  url: string;
  /** How many requests were forwarded to the backend. */
  forwarded: () => number;
  close: () => Promise<void>;
}

export const readVercelConfig = (): VercelConfig => JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as VercelConfig;

export function startVercelLike(backend: string): Promise<Rig> {
  const config = readVercelConfig();
  const rules = config.rewrites.map((r) => ({ re: new RegExp("^" + r.source.replace(/:path\*/, "(.*)") + "$"), tail: new URL(r.destination.replace(":path*", "$1").replace("$1", "")).pathname }));
  let forwarded = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    for (const h of config.headers[0]?.headers ?? []) res.setHeader(h.key, h.value);

    const rule = rules.map((r) => ({ r, m: r.re.exec(url.pathname) })).find((x) => x.m);
    if (rule?.m) {
      forwarded++;
      const target = new URL(backend);
      const headers = { ...req.headers, host: target.host };
      const up = http.request({ host: target.hostname, port: target.port, path: rule.r.tail + rule.m[1] + url.search, method: req.method, headers }, (back) => {
        const out = { ...back.headers };
        for (const h of config.headers[0]?.headers ?? []) delete out[h.key.toLowerCase()]; // ours win, as on Vercel
        for (const [k, v] of Object.entries(out)) if (v !== undefined) res.setHeader(k, v);
        res.statusCode = back.statusCode ?? 502;
        back.pipe(res);
      });
      up.on("error", () => void res.writeHead(502).end());
      req.pipe(up);
      return;
    }

    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end();
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(fs.readFileSync(file));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        // `localhost`, not 127.0.0.1: Chromium only keeps `Secure` cookies from http://localhost (like a real https origin)
        url: `http://localhost:${port}`,
        forwarded: () => forwarded,
        close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
      });
    });
  });
}
