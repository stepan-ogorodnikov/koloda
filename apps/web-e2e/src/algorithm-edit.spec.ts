import { expect, test } from "@playwright/test";
import { createAlgorithm, openSection, setSliderValue } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("creates an algorithm, modifies parameters, and verifies persistence", async ({ page }) => {
  const algorithmTitle = "E2E Algorithm";
  const updatedTitle = "E2E Algorithm Updated";
  const notes = "E2E preset notes";
  const weights =
    "0.3, 1.3, 2.3, 8.3, 6.4, 0.8, 3, 0.001, 1.9, 0.2, 0.8, 1.5, 0.06, 0.3, 1.6, 0.6, 1.9, 0.5, 0.1, 0.07, 0.15";

  await setupWeb(page);
  await createAlgorithm(page, algorithmTitle);

  // Modify parameters
  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(titleField).toBeVisible();
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();

  // Change retention
  await setSliderValue(page, "Retention", 85);

  // Change notes, the first learning step, and the weights
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill(notes);
  const learningStepField = page.getByRole("textbox", { name: "Amount for learning step number 1" });
  await learningStepField.fill("5");
  await learningStepField.blur();
  const weightsField = page.getByRole("textbox", { name: "Weights" });
  await weightsField.fill(weights);
  await weightsField.blur();

  // Save changes
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Verify persistence after navigation
  await openSection(page, "Dashboard");
  await openSection(page, "Presets");
  await page.getByRole("link", { name: updatedTitle, exact: true }).click();
  await expect(page).toHaveURL(
    /\/algorithms\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);
  await expect(page.getByRole("slider", { name: "Retention" })).toHaveValue("85");
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(notes);
  await expect(learningStepField).toHaveValue("5");
  await expect(weightsField).toHaveValue(weights);

  // Invalid weights are rejected on save, and the saved weights stay
  await weightsField.fill("1, 2");
  await weightsField.blur();
  await saveButton.click();
  await expect(page.locator("form").getByText("Invalid FSRS weights", { exact: true })).toBeVisible();
  await page.locator("form").getByRole("button", { name: "Discard", exact: true }).click();
  await expect(weightsField).toHaveValue(weights);
});
