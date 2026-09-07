import type { Page } from "@playwright/test";
import { applyPageDefaults, bootstrapApp } from "@koloda/e2e";

export async function setupPageDefaults(page: Page) {
  await applyPageDefaults(page, "after-load");
}

export async function setupApp(page: Page) {
  await bootstrapApp(page, "Setting up your database");
}
