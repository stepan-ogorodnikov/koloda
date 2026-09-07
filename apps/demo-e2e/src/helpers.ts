import type { Page } from "@playwright/test";
import { applyPageDefaults, bootstrapApp } from "@koloda/e2e";

export async function setupPageDefaults(page: Page) {
  await applyPageDefaults(page, "before-load");
}

export async function setupDemo(page: Page) {
  await page.goto("/");
  await bootstrapApp(page, "Setting up a demo");
}
