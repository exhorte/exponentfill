// S5 part of the rehearsal (imported by rehearse-s3-s5.mjs). Runs the whole case list through the writer extension.
import path from "node:path";

export async function s5({ spikes, start, waitFor, record, loadExtension }) {
  const BASE = "http://localhost:5800";
  start(path.join(spikes, "server/serve.mjs"));
  record("S5 fixture server up", await waitFor(`${BASE}/whoami`));
  record("S5 framework bench is built (spikes/frameworks/dist)", (await fetch(`${BASE}/fx/pages/react-basic.html`)).ok, "run `pnpm build` in spikes/frameworks if this fails");
  const { context, extId, close } = await loadExtension(path.join(spikes, process.env.REHEARSE_S5_DIR ?? "s5-writer")); // REHEARSE_S5_DIR=s5-writer-product/ext measures the PRODUCT writer
  try {
    const P = await context.newPage();
    await P.goto(`chrome-extension://${extId}/sidepanel.html`);
    const F = await context.newPage();
    await F.goto(`${BASE}/form-basic.html`);
    await F.bringToFront();
    await P.waitForTimeout(500);
    await P.click("#run-all");
    await P.waitForFunction(() => globalThis.__s5Done === true, null, { timeout: 240000, polling: 1000 });
    const rows = await P.evaluate(() => globalThis.__s5Rows);

    const by = (o) => rows.filter((r) => r.outcome === o);
    const table = {};
    for (const r of rows) { const c = (table[r.cat] ??= { cases: 0, success: 0, explicitFailure: 0, expected: 0, refusals: 0, bad: 0 }); c.cases++; if (r.outcome === "success") c.success++; else if (r.outcome === "explicit-failure") c.explicitFailure++; else if (/expected-failure-ok/.test(r.outcome)) c.expected++; else if (r.outcome === "refusal-ok") c.refusals++; else c.bad++; }
    console.log("\nS5 results by category:");
    for (const [k, v] of Object.entries(table)) console.log(`  ${k.padEnd(14)} cases=${v.cases} success=${v.success} explicit-failure=${v.explicitFailure} expected-failure=${v.expected} refusals=${v.refusals} other=${v.bad}`);
    for (const r of rows.filter((x) => !["success", "refusal-ok", "expected-failure-ok"].includes(x.outcome))) console.log(`  [${r.outcome}] ${r.id}: ${r.writer.status} ${r.writer.reason ?? ""} | page truth=${JSON.stringify(r.actual)}`);

    record(`S5 ran ${rows.length} cases`, rows.length > 50, { cases: rows.length });
    record("S5 NO SILENT FAILURE: the writer never claimed a write that the page's own state does not show", by("SILENT-FAILURE").length === 0, by("SILENT-FAILURE").map((r) => r.id));
    record("S5 secrets, read-only and disabled fields are refused", by("REFUSAL-VIOLATION").length === 0 && rows.filter((r) => r.cat === "guard").every((r) => r.outcome === "refusal-ok"));
    record("S5 Unicode (Arabic, Cyrillic, CJK, accents) round-trips untouched", rows.filter((r) => r.cat === "unicode").every((r) => r.outcome === "success"), rows.filter((r) => r.cat === "unicode").map((r) => r.outcome));
    record("S5 combobox protocol: ambiguous and no-match are EXPLICIT failures, never a false selection", ["combo.city-ambiguous", "combo.city-nomatch"].every((id) => rows.find((r) => r.id === id)?.outcome === "expected-failure-ok"));
    record("S5 closed and nested shadow roots are written", rows.filter((r) => r.cat === "shadow").every((r) => r.outcome === "success"), rows.filter((r) => r.cat === "shadow").map((r) => r.outcome));
    record("S5 plain React, Vue and Angular state follows the writes", rows.filter((r) => ["react", "vue", "angular"].includes(r.cat)).every((r) => r.outcome === "success"), rows.filter((r) => ["react", "vue", "angular"].includes(r.cat) && r.outcome !== "success").map((r) => `${r.id}:${r.outcome}`));
    const overall = rows.filter((r) => !["guard"].includes(r.cat) && r.expect === "success");
    const rate = overall.filter((r) => r.outcome === "success").length / overall.length;
    record("S5 overall verified-write rate is measured (informative; the invariant is zero silent failure)", true, { rate: Math.round(rate * 100) + "%", of: overall.length });
  } finally { await close(); }
}
