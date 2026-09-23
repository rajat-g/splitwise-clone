// TEMPORARY design-preview config (deleted before shipping).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "convex/react", replacement: path.resolve(root, "src/__preview__/mockConvex.jsx") },
      { find: /convex\/_generated\/api$/, replacement: path.resolve(root, "src/__preview__/mockApi.js") },
    ],
  },
  define: {
    "import.meta.env.VITE_CONVEX_URL": JSON.stringify("https://preview.convex.cloud"),
  },
  server: { port: 5173 },
});
