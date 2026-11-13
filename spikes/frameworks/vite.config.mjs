// Throwaway S5 fixture bench: one tiny page per UI library, built to static files in dist/ (served under /fx/).
// Every page shows a PAGE-OWNED readout (#state) of the framework's own state: a write only counts when that state changed,
// not merely when the DOM node shows the text (the classic failure of naive fillers on React/Vue/Angular).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

const pages = ["react-basic", "react-mui", "react-select", "antd", "vue-basic", "quill", "tiptap", "prosemirror"];

export default defineConfig({
  base: "./",
  plugins: [react(), vue()],
  build: {
    outDir: "dist",
    emptyOutDir: false, // build-angular.mjs also writes into dist/
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        index: resolve("index.html"),
        ...Object.fromEntries(pages.map((p) => [p, resolve(`pages/${p}.html`)])),
      },
    },
  },
});
