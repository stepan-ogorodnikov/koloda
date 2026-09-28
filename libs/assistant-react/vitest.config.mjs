import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/assistant-react",
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    pool: "threads",
    isolate: false,
    maxWorkers: 2,
    environment: "jsdom",
    include: ["libs/assistant-react/src/**/*.test.ts", "libs/assistant-react/src/**/*.test.tsx"],
    setupFiles: ["libs/assistant-react/src/test-setup.ts"],
  },
});
