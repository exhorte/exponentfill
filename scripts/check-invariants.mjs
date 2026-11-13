// Static security-invariant checks (CLAUDE.md "Hard rules"). Zero dependencies. Run: `pnpm check:invariants`.
// Escape hatch for a justified exception: put `invariant-ok: <reason>` in a comment on the SAME line.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".output", ".wxt", "dist", ".venv", "spikes", "test-results", "playwright-report", "__pycache__", ".git", "migrations"]);
const problems = [];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const rel = (p) => relative(root, p).split(sep).join("/");
const isTest = (p) => /(\.test\.|\.spec\.|\/tests?\/|\/e2e\/)/.test(rel(p));

// 1. Forbidden code patterns in PRODUCT sources (never in tests or spikes).
const TS_RULES = [
  [/\bchrome\.debugger\b/, "chrome.debugger is forbidden in the MVP (ADR-003)"],
  [/\beval\s*\(/, "eval() is forbidden"],
  [/new Function\s*\(/, "new Function() is forbidden"],
  [/document\.write\s*\(/, "document.write() is forbidden"],
  [/\.requestSubmit\s*\(/, "programmatic form submission is forbidden (level 3, ADR-006)"],
  [/\bform\w*\.submit\s*\(\s*\)/i, "programmatic form submission is forbidden (level 3, ADR-006)"],
  [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML is forbidden"],
  [/\.innerHTML\s*=/, "assigning innerHTML is forbidden (untrusted page content)"],
  [/\bchrome\.webRequest\b/, "network interception is not part of the product"],
];
const PY_RULES = [
  [/allow_origins\s*=\s*\[\s*["']\*["']\s*\]/, "CORS must never allow every origin"],
  [/\beval\s*\(|\bexec\s*\(/, "eval/exec are forbidden"],
  [/pickle\.loads?\s*\(/, "unpickling untrusted data is forbidden"],
  [/subprocess\.(run|Popen|call)\s*\([^)]*shell\s*=\s*True/, "shell=True is forbidden"],
  [/\byaml\.load\s*\((?![^)]*SafeLoader)/, "yaml.load without SafeLoader is forbidden"],
  [/verify\s*=\s*False/, "TLS verification must never be disabled"],
];

// 1b. The writer and the filler can NEVER commit (level 3 is structural, ADR-006 / ADR-023): no submit event, no key presses
// (Enter submits forms), no form submission. Tests may build such events on purpose; product sources may not.
const WRITER_RULES = [
  [/["']submit["']/, "the writer must never create, dispatch or target a submit event (level 3)"],
  [/\bKeyboardEvent\b|["']Enter["']|\bkeyCode\b|\bkeydown\b|\bkeypress\b/, "the writer must never press keys: Enter submits forms (level 3)"],
  [/\.(submit|requestSubmit)\s*\(/, "the writer must never submit a form (level 3)"],
];
const isWriterSource = (r) => /^packages\/form-writer\/src\//.test(r) || r === "apps/extension/src/entrypoints/filler.content.ts";

for (const file of walk(root)) {
  const r = rel(file);
  if (isTest(file)) continue;
  if (isWriterSource(r)) {
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (/invariant-ok:/.test(line)) return;
      for (const [re, why] of WRITER_RULES) if (re.test(line)) problems.push(`${r}:${i + 1}  ${why}\n    ${line.trim().slice(0, 140)}`);
    });
  }
  const isTs = /\.(ts|tsx|js|mjs|jsx)$/.test(file) && /^(apps|packages)\/[^/]+\/(src|entrypoints|lib)\//.test(r) || /^(apps|packages)\/[^/]+\/src\//.test(r);
  const isPy = file.endsWith(".py") && r.startsWith("apps/backend/app/");
  if (!isTs && !isPy) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/invariant-ok:/.test(line)) return;
    for (const [re, why] of isPy ? PY_RULES : TS_RULES) if (re.test(line)) problems.push(`${r}:${i + 1}  ${why}\n    ${line.trim().slice(0, 140)}`);
  });
}

// 2. Manifest configuration: no debugger permission, no broad host access at install time.
const wxt = readFileSync(join(root, "apps/extension/wxt.config.ts"), "utf8");
if (/["']debugger["']/.test(wxt.replace(/\/\/.*$/gm, ""))) problems.push("apps/extension/wxt.config.ts  the debugger permission must not be declared (ADR-003)");
const hostPerm = /(?<!optional_)host_permissions\s*:\s*\[([^\]]*)\]/s.exec(wxt)?.[1] ?? "";
if (/<all_urls>|\*:\/\/\*\/|https?:\/\/\*\//.test(hostPerm)) problems.push("apps/extension/wxt.config.ts  host_permissions must not contain broad patterns (ADR-004)");

// 3. No telemetry / analytics dependency (ADR-014).
const TELEMETRY = /(posthog|sentry|mixpanel|amplitude|segment|google-analytics|gtag|datadog|logrocket|hotjar|fullstory)/i;
for (const file of walk(root)) {
  if (!file.endsWith("package.json")) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) if (TELEMETRY.test(dep)) problems.push(`${rel(file)}  telemetry dependency "${dep}" is forbidden by default (ADR-014)`);
}
const py = readFileSync(join(root, "apps/backend/pyproject.toml"), "utf8");
for (const m of py.matchAll(/"([a-z0-9_.-]+)[><=~! ]/gi)) if (TELEMETRY.test(m[1])) problems.push(`apps/backend/pyproject.toml  telemetry dependency "${m[1]}" is forbidden by default (ADR-014)`);

if (problems.length) {
  console.error(`check-invariants: ${problems.length} problem(s)\n\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("check-invariants: OK (no forbidden API, manifest and dependencies compliant)");
