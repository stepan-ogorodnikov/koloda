import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/assistant",
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    pool: "threads",
    // WHY: These files share a worker module registry to skip per-file isolation cost.
    // A file-level vi.mock leaks for the whole worker; no file here mocks a module a sibling imports for real.
    isolate: false,
    maxWorkers: 2,
    environment: "node",
    include: ["libs/assistant/src/**/*.test.ts"],
  },
});
