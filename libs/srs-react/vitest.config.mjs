import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/srs-react",
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["libs/srs-react/src/**/*.test.ts", "libs/srs-react/src/**/*.test.tsx"],
    setupFiles: ["libs/srs-react/src/test-setup.ts"],
  },
});
