import { defineConfig } from "vite";

// The Hono server serves client/dist at "/" and owns the /api routes and the /ws socket. In dev,
// Vite proxies both to it so the same relative URLs work in both places.
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 800,
  },
});
