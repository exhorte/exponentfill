// Bundles the Angular fixture (JIT) with esbuild into dist/ next to the Vite pages. Offline-capable.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["src/angular/main.ts"],
  outfile: "dist/angular-basic.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  tsconfig: "tsconfig.angular.json",
  logLevel: "info",
});
copyFileSync("angular-basic.html", "dist/angular-basic.html");
console.log("angular fixture -> dist/angular-basic.html");
