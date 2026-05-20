import { expect, test } from "@playwright/test";
import { openLearningSettings, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("shows validation error when new limit exceeds total", async ({ page }) => {
  await setupDemo(page);
  await openLearningSettings(page);

  // Set total to a low value
  const totalField = page.getByRole("textbox", { name: "Total" });
  await totalField.click();
  await totalField.fill("5");
  await totalField.blur();

  // New is already set to 50 by default and counts towards total
  // Try to save - validation runs on submit
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  // Verify error appears
  await expect(page.getByText("New can't be more than total")).toBeVisible();
});

test("shows validation error when learn limit exceeds total", async ({ page }) => {
  await setupDemo(page);
  await openLearningSettings(page);

  // Set total to a low value
  const totalField = page.getByRole("textbox", { name: "Total" });
  await totalField.click();
  await totalField.fill("5");
  await totalField.blur();

  // Set "Learn" to exceed total
  const learnField = page.getByRole("textbox", { name: "Learn" });
  await learnField.click();
  await learnField.fill("10");
  await learnField.blur();

  // Enable "Counts towards total" for Learn by clicking on the second switch
  const learnSwitch = page.getByRole("switch", { name: "Counts towards total" }).nth(1);
  await learnSwitch.click({ force: true });

  // Try to save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  // Verify error appears
  await expect(page.getByText("Learn can't be more than total")).toBeVisible();
});

test("shows validation error when review limit exceeds total", async ({ page }) => {
  await setupDemo(page);
  await openLearningSettings(page);

  // Set total to a low value
  const totalField = page.getByRole("textbox", { name: "Total" });
  await totalField.click();
  await totalField.fill("5");
  await totalField.blur();

  // Set "Review" to exceed total (Review counts towards total by default)
  const reviewField = page.getByRole("textbox", { name: "Review" });
  await reviewField.click();
  await reviewField.fill("10");
  await reviewField.blur();

  // Try to save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  // Verify error appears
  await expect(page.getByText("Review can't be more than total")).toBeVisible();
});

test("does not show validation error when counts switch is off", async ({ page }) => {
  await setupDemo(page);
  await openLearningSettings(page);

  // Set total to a low value
  const totalField = page.getByRole("textbox", { name: "Total" });
  await totalField.click();
  await totalField.fill("5");
  await totalField.blur();

  // Set "Learn" to exceed total but keep "Counts towards total" OFF (default is off)
  const learnField = page.getByRole("textbox", { name: "Learn" });
  await learnField.click();
  await learnField.fill("10");
  await learnField.blur();

  // Verify the switch is unchecked
  const learnSwitch = page.getByRole("switch", { name: "Counts towards total" }).nth(1);
  await expect(learnSwitch).not.toBeChecked();

  // Try to save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  // Verify no error appears
  await expect(page.getByText("Learn can't be more than total")).not.toBeVisible();
});
