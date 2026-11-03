import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001", changeOrigin: true },
      "/health": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001", changeOrigin: true }
    }
  },
  build: { sourcemap: true }
});