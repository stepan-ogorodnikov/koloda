import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/native-electron-react/src/**/*.test.ts"],
  },
});
