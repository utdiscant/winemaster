import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The app is served from vinblinder.dk/wset-training. Building into dist/wset-training puts the
// files at that path for the Worker's static assets.
export default defineConfig({
  base: "/wset-training/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/wset-training"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // In development the API runs in `wrangler dev`
    proxy: {
      "/wset-training/api": "http://localhost:8787",
    },
  },
});
