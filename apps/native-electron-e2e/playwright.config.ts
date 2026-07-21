import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = 3000;

export default defineConfig({
  testDir: "./src",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: "list",
  outputDir: "../../dist/apps/native-electron-e2e/test-results",
  use: {
    locale: "en-US",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `bunx vite --config apps/native-electron-react/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: resolve(__dirname, "../.."),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
