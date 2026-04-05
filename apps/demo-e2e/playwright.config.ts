import { defineConfig, devices } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = 4300;

export default defineConfig({
  testDir: "./src",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  outputDir: "../../dist/apps/demo-e2e/test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-US",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: `bunx vite --config apps/demo/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: resolve(__dirname, "../.."),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
