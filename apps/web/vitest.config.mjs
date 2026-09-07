import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/apps/web-unit",
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["apps/web/src/**/*.test.ts"],
  },
});
