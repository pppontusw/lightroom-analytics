import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5183,
    host: true,
    allowedHosts: ["dev1.kingfisher-vibe.ts.net"],
    proxy: {
      "/api":
        process.env.API_PROXY_TARGET ?? "http://localhost:8118",
    },
  },
  build: {
    outDir: "dist",
  },
});
