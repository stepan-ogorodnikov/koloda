import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/apps/demo-unit",
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["apps/demo/src/**/*.test.ts"],
  },
});
