import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/core-react",
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["libs/core-react/src/**/*.test.ts"],
    setupFiles: ["libs/core-react/src/test-setup.ts"],
  },
});
