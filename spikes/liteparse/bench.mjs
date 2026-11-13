// Throwaway spike S10: LiteParse (WASM, Apache-2.0) on the fictitious corpus, scored like the Python engines.
// Runs in Node here; the product target is an offscreen document in the extension (not exercised by this script).
//   node bench.mjs          (from spikes/liteparse, after `pnpm install`)
// Writes ../s10/results-liteparse.json. Scoring is a port of ../s10/bench.py (same normalisation).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import init, { initSync, LiteParse } from "@llamaindex/liteparse-wasm";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(here, "../s10/corpus");
const require = createRequire(import.meta.url);
const wasmPath = require.resolve("@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm");

void init; // default export kept for browser use; in Node we initialise synchronously from bytes
initSync({ module: await readFile(wasmPath) });

const norm = (s, fold) => {
  let t = s.normalize("NFKC").replaceAll("’", "'").replaceAll(" ", " ");
  if (fold) t = t.normalize("NFD").replace(/\p{Mn}/gu, "");
  return t.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
};
const recall = (text, expected, fold) => {
  const hay = norm(text, fold);
  return expected.length ? expected.filter((e) => hay.includes(norm(e, fold))).length / expected.length : 1;
};
const orderScore = (text, order) => {
  if (order.length < 2) return null;
  const hay = norm(text, true);
  const pos = order.map((o) => hay.indexOf(norm(o, true)));
  const pairs = pos.slice(1).map((b, i) => [pos[i], b]);
  return pairs.filter(([a, b]) => a >= 0 && b >= 0 && a < b).length / pairs.length;
};

const truth = JSON.parse(await readFile(resolve(corpus, "truth.json"), "utf8"));
const rows = [];
for (const [doc, t] of Object.entries(truth)) {
  const bytes = new Uint8Array(await readFile(resolve(corpus, doc)));
  const row = { engine: "liteparse-wasm", doc, kind: t.kind, error: null };
  try {
    const parser = new LiteParse({ ocrEnabled: false, outputFormat: "markdown", quiet: true });
    const t0 = performance.now();
    const result = await parser.parse(bytes);
    const seconds = (performance.now() - t0) / 1000;
    const complexity = await parser.isComplex(bytes);
    const text = result.text ?? "";
    Object.assign(row, {
      seconds: Math.round(seconds * 1000) / 1000, chars: text.length, pages: result.pages?.length ?? 0,
      recall_exact: Math.round(recall(text, t.expected, false) * 1000) / 1000,
      recall_folded: Math.round(recall(text, t.expected, true) * 1000) / 1000,
      order: orderScore(text, t.order),
      needsOcr: complexity.some((p) => p.needsOcr), reasons: [...new Set(complexity.flatMap((p) => p.reasons))],
    });
    parser.free?.();
  } catch (e) {
    row.error = `${e?.name ?? "Error"}: ${e?.message ?? e}`;
  }
  rows.push(row);
  console.log(`liteparse-wasm ${doc.padEnd(24)} ` + (row.error ?? `${String(row.seconds).padStart(7)}s  exact=${row.recall_exact} folded=${row.recall_folded} order=${row.order} needsOcr=${row.needsOcr} ${row.reasons.join(",")}`));
}
await writeFile(resolve(here, "../s10/results-liteparse.json"), JSON.stringify(rows, null, 1));
