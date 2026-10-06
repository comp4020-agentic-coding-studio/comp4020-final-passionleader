import { defineConfig } from "vite";

// The Hono server serves client/dist at "/" and owns the /api routes. In dev,
// Vite proxies /api to it so the same relative URLs work in both places.
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 800,
  },
});
