import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // vite-plugin-pwa is a build-time plugin; stub its virtual module in tests.
      "virtual:pwa-register": path.resolve(import.meta.dirname, "vitest.pwa-stub.js"),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          environment: "jsdom",
          include: ["src/**/*.test.{js,jsx}"],
          setupFiles: ["./vitest.setup.js"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{js,jsx}", "convex/*.ts"],
      exclude: [
        "src/__preview__/**",
        "src/**/*.test.{js,jsx}",
        "convex/**/*.test.ts",
        "convex/_generated/**",
        "**/node_modules/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
