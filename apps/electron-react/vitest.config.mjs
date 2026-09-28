import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    maxWorkers: 2,
    environment: "node",
    include: ["apps/electron-react/src/**/*.test.ts"],
  },
});
