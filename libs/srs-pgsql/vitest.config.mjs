import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/srs-pgsql",
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      "@lingui/core/macro": resolve(__dirname, "src/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["libs/srs-pgsql/src/**/*.test.ts"],
  },
});
