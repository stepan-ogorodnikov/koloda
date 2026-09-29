import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/core-react",
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    pool: "threads",
    // WHY: These files share a worker module registry to skip per-file isolation cost.
    // A file-level vi.mock leaks for the whole worker; no file here mocks a module a sibling imports for real.
    isolate: false,
    maxWorkers: 2,
    environment: "node",
    include: ["libs/core-react/src/**/*.test.ts"],
    setupFiles: ["libs/core-react/src/test-setup.ts"],
  },
});
