import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/core-react",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "node",
    include: ["libs/core-react/src/**/*.test.ts"],
    setupFiles: ["libs/core-react/src/test-setup.ts"],
  },
});
