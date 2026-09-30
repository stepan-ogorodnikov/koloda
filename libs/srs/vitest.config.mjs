import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/srs",
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
    // WHY: reviews.dst.test.ts needs a process that starts in America/New_York.
    // Threads share this process's ICU timezone, so that file runs from vitest.dst.config.mjs.
    include: ["libs/srs/src/**/*.test.ts", "!libs/srs/src/lib/reviews.dst.test.ts"],
    setupFiles: ["libs/srs/src/test-setup.ts"],
  },
});
