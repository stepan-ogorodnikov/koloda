import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/srs-conformance-america-new-york",
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["libs/srs/src/lib/conformance/**/*.test.ts"],
    setupFiles: ["libs/srs/src/test-setup.ts"],
    env: {
      TZ: "America/New_York",
    },
  },
});
