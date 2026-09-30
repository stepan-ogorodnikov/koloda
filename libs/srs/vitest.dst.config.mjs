import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// WHY: ICU reads the timezone when the process starts. A fork is a new process
// that starts with TZ already set; a thread keeps the parent timezone.
export default defineConfig({
  cacheDir: "../../node_modules/.vite/libs/srs-dst",
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@lingui/core/macro": resolve(__dirname, "../../tools/test/mocks/lingui-core-macro.ts"),
    },
  },
  test: {
    pool: "forks",
    maxWorkers: 1,
    environment: "node",
    include: ["libs/srs/src/lib/reviews.dst.test.ts"],
    setupFiles: ["libs/srs/src/test-setup.ts"],
    env: {
      TZ: "America/New_York",
    },
  },
});
