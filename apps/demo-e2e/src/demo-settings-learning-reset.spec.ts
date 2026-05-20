import { expect, test } from "@playwright/test";
import { createAlgorithm, createTemplate, openLearningSettings, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("discards changes to learning settings and resets form to persisted state", async ({ page }) => {
  await setupDemo(page);

  // Create algorithm and template to have options in the pickers
  await createAlgorithm(page, "Test Algorithm");
  await createTemplate(page, "Test Template");

  await openLearningSettings(page);

  // Capture initial values
  const initialAlgorithm = await page.getByRole("button", { name: "Default algorithm" }).innerText();
  const initialTemplate = await page.getByRole("button", { name: "Default template" }).innerText();
  const initialTotal = await page.getByRole("textbox", { name: "Total" }).inputValue();
  const initialNew = await page.getByRole("textbox", { name: "New" }).inputValue();
  const initialLearn = await page.getByRole("textbox", { name: "Learn" }).inputValue();
  const initialReview = await page.getByRole("textbox", { name: "Review" }).inputValue();
  const initialHours = await page.getByRole("textbox", { name: "Hours" }).inputValue();
  const initialMinutes = await page.getByRole("textbox", { name: "Minutes" }).inputValue();

  // Change algorithm
  await page.getByRole("button", { name: "Default algorithm" }).click();
  const algoOption = page.getByRole("option", { name: "Test Algorithm", exact: true });
  await expect(algoOption).toBeVisible();
  await algoOption.click();

  // Change template
  await page.getByRole("button", { name: "Default template" }).click();
  const templateOption = page.getByRole("option", { name: "Test Template", exact: true });
  await expect(templateOption).toBeVisible();
  await templateOption.click();

  // Change daily limits
  const totalField = page.getByRole("textbox", { name: "Total" });
  await totalField.click();
  await totalField.fill("50");
  await totalField.blur();

  const newField = page.getByRole("textbox", { name: "New" });
  await newField.click();
  await newField.fill("20");
  await newField.blur();

  const learnField = page.getByRole("textbox", { name: "Learn" });
  await learnField.click();
  await learnField.fill("15");
  await learnField.blur();

  const reviewField = page.getByRole("textbox", { name: "Review" });
  await reviewField.click();
  await reviewField.fill("35");
  await reviewField.blur();

  // Change learn-ahead limit
  const hoursField = page.getByRole("textbox", { name: "Hours" });
  await hoursField.click();
  await hoursField.fill("2");
  await hoursField.blur();

  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  await minutesField.click();
  await minutesField.fill("45");
  await minutesField.blur();

  // Click "Discard" to reset the form
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  // Verify form reset to original persisted values
  await expect(page.getByRole("button", { name: "Default algorithm" })).toContainText(initialAlgorithm);
  await expect(page.getByRole("button", { name: "Default template" })).toContainText(initialTemplate);
  await expect(page.getByRole("textbox", { name: "Total" })).toHaveValue(initialTotal);
  await expect(page.getByRole("textbox", { name: "New" })).toHaveValue(initialNew);
  await expect(page.getByRole("textbox", { name: "Learn" })).toHaveValue(initialLearn);
  await expect(page.getByRole("textbox", { name: "Review" })).toHaveValue(initialReview);
  await expect(page.getByRole("textbox", { name: "Hours" })).toHaveValue(initialHours);
  await expect(page.getByRole("textbox", { name: "Minutes" })).toHaveValue(initialMinutes);
});
