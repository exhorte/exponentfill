// Throwaway helper: print what LiteParse extracts from one corpus PDF (markdown), e.g. `node show.mjs releve_notes_fr.pdf`.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { initSync, LiteParse } from "@llamaindex/liteparse-wasm";

const here = dirname(fileURLToPath(import.meta.url));
const wasm = createRequire(import.meta.url).resolve("@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm");
initSync({ module: await readFile(wasm) });
const doc = process.argv[2] ?? "cv_fr_simple.pdf";
const bytes = new Uint8Array(await readFile(resolve(here, "../s10/corpus", doc)));
const result = await new LiteParse({ ocrEnabled: false, outputFormat: "markdown", quiet: true }).parse(bytes);
console.log(result.text);
