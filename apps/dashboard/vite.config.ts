import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development `/v1` is proxied to the backend: one origin, so the SameSite=Lax session cookie works and no CORS is needed.
const backend = process.env.DASHBOARD_BACKEND_URL ?? "http://127.0.0.1:8010";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { "/v1": { target: backend, changeOrigin: false } } },
  build: { outDir: "dist", sourcemap: false },
});
