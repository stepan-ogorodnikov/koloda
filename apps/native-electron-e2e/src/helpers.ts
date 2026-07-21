import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export async function setupPageDefaults(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("scheme", "light");
    window.localStorage.setItem("motion", "off");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
}

export async function setupApp(page: Page) {
  await expect(page.getByText("Setting up your database", { exact: true })).toBeVisible();

  const startButton = page.getByRole("button", { name: "Get started", exact: true });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Learned today", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Templates", exact: true })).toBeVisible();
}

export async function openSection(page: Page, name: string) {
  const navigationLink = getNavigation(page, name);
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();
}

export function getNavigation(page: Page, name: string): Locator {
  return page.getByRole("link", { name, exact: true }).first();
}
