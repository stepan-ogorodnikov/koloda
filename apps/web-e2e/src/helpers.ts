import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { applyPageDefaults } from "@koloda/e2e";

export async function setupPageDefaults(page: Page) {
  await applyPageDefaults(page, "before-load");
}

export async function setupWeb(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-setup-screen]")).toBeVisible();

  const startButton = page.locator("[data-setup-submit]");
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Learned today", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Templates", exact: true })).toBeVisible();
}
