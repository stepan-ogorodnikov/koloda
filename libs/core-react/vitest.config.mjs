import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/core-react",
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["libs/core-react/src/**/*.test.ts"],
    setupFiles: ["libs/core-react/src/test-setup.ts"],
  },
});
