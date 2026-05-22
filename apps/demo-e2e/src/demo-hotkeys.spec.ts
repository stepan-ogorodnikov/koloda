import { expect, test } from "@playwright/test";
import { openLearningSettings, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("navigates between sections using keyboard shortcuts", async ({ page }) => {
  await setupDemo(page);

  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();

  await page.keyboard.press("p");
  await expect(page).toHaveURL(/\/algorithms$/);
  await expect(page.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();

  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/decks$/);
  await expect(page.getByRole("heading", { name: "Decks", exact: true })).toBeVisible();

  await page.keyboard.press("h");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Learned today", { exact: true })).toBeVisible();

  await page.keyboard.press("Control+,");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("submits and resets the learning settings form with Ctrl+S and Ctrl+D", async ({ page }) => {
  await setupDemo(page);
  await openLearningSettings(page);

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  const hoursField = page.getByRole("textbox", { name: "Hours" });

  await hoursField.click();
  await hoursField.clear();
  await hoursField.fill("2");
  await hoursField.blur();

  await expect(saveButton).toBeVisible();

  await page.keyboard.press("Control+s");

  await expect(saveButton).not.toBeVisible();
  await expect(hoursField).toHaveValue("2");

  await hoursField.click();
  await hoursField.clear();
  await hoursField.fill("5");
  await hoursField.blur();

  await expect(saveButton).toBeVisible();

  await page.keyboard.press("Control+d");

  await expect(saveButton).not.toBeVisible();
  await expect(hoursField).toHaveValue("2");
});
