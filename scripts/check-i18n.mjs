// Checks that every locale defines the same message keys as the default locale (en).
// Run with: pnpm check:i18n
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const localesDir = path.resolve(import.meta.dirname, "../apps/extension/public/_locales");
const load = (locale) =>
  JSON.parse(readFileSync(path.join(localesDir, locale, "messages.json"), "utf8"));

const reference = Object.keys(load("en")).sort();
let failed = false;

for (const locale of readdirSync(localesDir)) {
  const keys = Object.keys(load(locale)).sort();
  const missing = reference.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !reference.includes(key));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`[${locale}] missing: ${missing.join(", ") || "-"} | extra: ${extra.join(", ") || "-"}`);
  } else {
    console.log(`[${locale}] OK (${keys.length} keys)`);
  }
}

process.exit(failed ? 1 : 0);
