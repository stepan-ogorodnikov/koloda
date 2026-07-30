import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../node_modules/.vite/tools",
  test: {
    environment: "node",
    include: ["tools/**/*.test.ts"],
  },
});
