// Copies the single vendored file the spike extension needs (hash-wasm's standalone Argon2id bundle, MIT)
// from spikes/frameworks/node_modules into spikes/ext/vendor. Zero dependencies. Run after `pnpm install` there.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkg = resolve(root, "frameworks/node_modules/hash-wasm");
const out = resolve(root, "ext/vendor");
if (!existsSync(pkg)) { console.error("hash-wasm not installed: run `pnpm install` in spikes/frameworks"); process.exit(1); }
await mkdir(out, { recursive: true });
await copyFile(resolve(pkg, "dist/argon2.umd.min.js"), resolve(out, "argon2.umd.min.js"));
await copyFile(resolve(pkg, "LICENSE"), resolve(out, "hash-wasm.LICENSE"));
const version = JSON.parse(await readFile(resolve(pkg, "package.json"), "utf8")).version;
await writeFile(resolve(out, "README.txt"), `Vendored for spike S7 only: hash-wasm@${version} (MIT), dist/argon2.umd.min.js.\nSee hash-wasm.LICENSE. Not product code.\n`);
console.log(`vendored hash-wasm@${version} -> ext/vendor`);
