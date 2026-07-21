import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/ui",
  plugins: [nxViteTsPaths()],
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["libs/ui/src/**/*.test.ts", "libs/ui/src/**/*.test.tsx"],
    setupFiles: ["libs/ui/src/test-setup.ts"],
  },
});
