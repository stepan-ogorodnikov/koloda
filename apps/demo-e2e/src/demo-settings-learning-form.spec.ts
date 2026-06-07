import { expect, test } from "@playwright/test";
import { createAlgorithm, createTemplate, openLearningSettings, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("validates and resets the learning settings form", async ({ page }) => {
  await setupDemo(page);

  await createAlgorithm(page, "Test Algorithm");
  await createTemplate(page, "Test Template");
  await openLearningSettings(page);

  const totalField = page.getByRole("textbox", { name: "Total" });
  const learnField = page.getByRole("textbox", { name: "Learn" });
  const reviewField = page.getByRole("textbox", { name: "Review" });
  const hoursField = page.getByRole("textbox", { name: "Hours" });
  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  const newField = page.getByRole("textbox", { name: "New" });
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  const learnSwitch = page.getByRole("switch", { name: "Counts towards total" }).nth(1);

  // Capture initial defaults from a clean form
  const initialAlgorithm = await page.getByRole("button", { name: "Default algorithm" }).innerText();
  const initialTemplate = await page.getByRole("button", { name: "Default template" }).innerText();
  const initialTotal = await totalField.inputValue();
  const initialNew = await newField.inputValue();
  const initialLearn = await learnField.inputValue();
  const initialReview = await reviewField.inputValue();
  const initialHours = await hoursField.inputValue();
  const initialMinutes = await minutesField.inputValue();

  // Validation 1: "New" exceeds "Total"
  await totalField.click();
  await totalField.fill("5");
  await totalField.blur();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("New can't be more than total")).toBeVisible();

  // Validation 2: "Learn" exceeds "Total" with switch on
  await learnField.click();
  await learnField.fill("10");
  await learnField.blur();

  await learnSwitch.click({ force: true });

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn can't be more than total")).toBeVisible();

  // Validation 3: "Review" exceeds "Total"
  await reviewField.click();
  await reviewField.fill("10");
  await reviewField.blur();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Review can't be more than total")).toBeVisible();

  // Validation 4: "Learn" exceeds "Total" but counts-towards-total is off
  // Reset "Review" first so it doesn't block the save
  await reviewField.click();
  await reviewField.fill("0");
  await reviewField.blur();

  await learnSwitch.click({ force: true });
  await expect(learnSwitch).not.toBeChecked();

  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).toBeDisabled();
  await expect(page.getByText("Learn can't be more than total")).not.toBeVisible();

  // Reset: mutate every field, click "Discard", verify revert to initial defaults
  await page.getByRole("button", { name: "Default algorithm" }).click();
  await page.getByRole("option", { name: "Test Algorithm", exact: true }).click();

  await page.getByRole("button", { name: "Default template" }).click();
  await page.getByRole("option", { name: "Test Template", exact: true }).click();

  await newField.click();
  await newField.fill("20");
  await newField.blur();
  await learnField.click();
  await learnField.fill("15");
  await learnField.blur();
  await reviewField.click();
  await reviewField.fill("35");
  await reviewField.blur();

  await hoursField.click();
  await hoursField.fill("2");
  await hoursField.blur();

  await minutesField.click();
  await minutesField.fill("45");
  await minutesField.blur();

  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  await expect(page.getByRole("button", { name: "Default algorithm" })).toContainText(initialAlgorithm);
  await expect(page.getByRole("button", { name: "Default template" })).toContainText(initialTemplate);
  await expect(totalField).toHaveValue(initialTotal);
  await expect(newField).toHaveValue(initialNew);
  await expect(learnField).toHaveValue(initialLearn);
  await expect(reviewField).toHaveValue(initialReview);
  await expect(hoursField).toHaveValue(initialHours);
  await expect(minutesField).toHaveValue(initialMinutes);
});
