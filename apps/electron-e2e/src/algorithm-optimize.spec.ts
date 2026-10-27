import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { openSection } from "@koloda/e2e";
import { setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

// WHY: desktop only; the web app offers no optimization (docs/specs/ALGORITHMS.md, Optimization).
test("optimizes a preset without reviews to not enough reviews", async ({ page }) => {
  await setupApp(page);

  // A fresh database seeds the "Default" preset and no reviews
  await openSection(page, "Presets");
  await page.getByRole("link", { name: "Default", exact: true }).click();
  await expect(page).toHaveURL(
    /\/algorithms\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  // The run crosses IPC, the addon, and the optimizer thread, and its result comes back
  await page.getByRole("button", { name: "Optimize", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Optimize weights" });
  await expect(dialog.getByText("Not enough reviews yet.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply", exact: true })).not.toBeVisible();

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
