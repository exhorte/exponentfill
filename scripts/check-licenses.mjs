// License gate for JavaScript dependencies: refuses GPL/AGPL/SSPL/unknown (ADR-017, LICENSE_AUDIT §4). `pnpm check:licenses`.
// Reads installed metadata through `pnpm licenses list --json` (offline). Add a justified exception in ALLOW below.
import { execSync } from "node:child_process";

const DENY = /\b(A?GPL|SSPL|BUSL|CPAL|OSL|EUPL|CC-BY-NC|Commons-Clause|UNLICENSED|UNKNOWN)\b/i;
const ALLOW = new Map([
  // ["package@version", "reason"]
]);

const raw = execSync("pnpm licenses list --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const byLicense = JSON.parse(raw);
const bad = [];
let total = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    total++;
    const id = `${p.name}@${p.versions?.[0] ?? "?"}`;
    // LGPL is reported (not denied): it needs a human decision, never a silent pass.
    if ((DENY.test(license) && !/^LGPL/i.test(license)) && !ALLOW.has(id)) bad.push(`${id}: ${license}`);
    else if (/LGPL/i.test(license) && !ALLOW.has(id)) bad.push(`${id}: ${license} (LGPL: needs a documented decision)`);
  }
}
if (bad.length) { console.error(`check-licenses: ${bad.length} dependency license(s) refused\n  ${bad.join("\n  ")}`); process.exit(1); }
console.log(`check-licenses: OK (${total} JavaScript packages, licenses: ${Object.keys(byLicense).sort().join(", ")})`);
