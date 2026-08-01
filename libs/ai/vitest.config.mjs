import tsconfigPaths from "vite-tsconfig-paths";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/ai",
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["libs/ai/src/**/*.test.ts"],
  },
});
