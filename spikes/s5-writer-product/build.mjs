// Throwaway build: assembles spikes/s5-writer-product/ext = the S5 harness (manifest, side panel, cases) + the PRODUCT writer bundled
// as writer.js. Run: node spikes/s5-writer-product/build.mjs   then   REHEARSE_ONLY=s5 REHEARSE_S5_DIR=s5-writer-product/ext node spikes/runner/rehearse-s3-s5.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(here, "ext");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["manifest.json", "background.js", "sidepanel.html", "sidepanel.js", "cases.js"]) fs.copyFileSync(path.join(root, "spikes/s5-writer", f), path.join(out, f));

const req = createRequire(path.join(root, "apps/dashboard/package.json"));
const { build } = await import(pathToFileURL(req.resolve("vite")).href);
await build({
  configFile: false,
  root: here,
  logLevel: "warn",
  build: { outDir: out, emptyOutDir: false, minify: false, sourcemap: false, target: "es2022", lib: { entry: path.join(here, "shim.js"), formats: ["iife"], name: "EfWriterProduct", fileName: () => "writer.js" } },
});
console.log("built", fs.readdirSync(out).join(", "), `(${fs.statSync(path.join(out, "writer.js")).size} bytes of product writer)`);
