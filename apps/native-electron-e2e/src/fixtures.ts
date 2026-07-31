import { test as base, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
const electronAppDir = resolve(workspaceRoot, "apps/native-electron");
const electronExecutable = require("electron") as string;

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
  userDataDir: string;
};

export const test = base.extend<ElectronFixtures>({
  // WHY: Playwright's fixture signature is `(parentFixtures, provide) => …`, so root fixtures must destructure an empty object.
  // Parameter is `provide` (not Playwright's usual `use`) so react/rules-of-hooks does not treat it as React `use`.
  userDataDir: async ({}, provide) => { // oxlint-disable-line no-empty-pattern
    const dir = await mkdtemp(resolve(tmpdir(), "koloda-e2e-"));
    await provide(dir);
    await rm(dir, { recursive: true, force: true });
  },

  electronApp: async ({ userDataDir }, provide) => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key === "ELECTRON_RUN_AS_NODE" || value === undefined) continue;
      env[key] = value;
    }
    env.KOLODA_USER_DATA = userDataDir;
    env.KOLODA_E2E = "1";

    const app = await electron.launch({
      executablePath: electronExecutable,
      args: ["-r", "tsx/esm", "."],
      cwd: electronAppDir,
      env,
    });

    await provide(app);
    await app.close();
  },

  page: async ({ electronApp }, provide) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await provide(page);
  },
});

export { expect };
export type { Page };
