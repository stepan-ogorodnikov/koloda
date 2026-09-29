import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/db-sqlite",
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  assetsInclude: ["**/*.sql"],
  server: {
    fs: {
      allow: [resolve(__dirname, "../..")],
    },
  },
  optimizeDeps: {
    exclude: ["wa-sqlite"],
  },
  test: {
    pool: "threads",
    // WHY: These files share a worker module registry to skip per-file isolation cost.
    // A file-level vi.mock leaks for the whole worker; no file here mocks a module a sibling imports for real.
    isolate: false,
    maxWorkers: 2,
    environment: "node",
    include: ["libs/db-sqlite/src/**/*.test.ts"],
    setupFiles: [resolve(__dirname, "src/test/setup.ts")],
    fileParallelism: false,
  },
});
