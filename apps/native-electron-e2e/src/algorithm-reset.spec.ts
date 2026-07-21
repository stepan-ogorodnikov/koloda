import { expect, test } from "./fixtures";
import { createAlgorithm, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("discards changes to algorithm details and resets form to persisted state", async ({ page }) => {
  const algorithmTitle = "E2E Reset Algorithm";
  const updatedTitle = "Updated Algorithm";

  await setupApp(page);
  await createAlgorithm(page, algorithmTitle);

  // Capture initial default values
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(algorithmTitle);
  const initialRetention = await page.getByRole("textbox", { name: "Retention" }).inputValue();
  const initialWeights = await page.getByRole("textbox", { name: "Weights" }).inputValue();
  const initialLearningStep = await page
    .getByRole("textbox", { name: "Amount for learning step number 1" })
    .inputValue();
  const initialRelearningStep = await page
    .getByRole("textbox", { name: "Amount for relearning step number 1" })
    .inputValue();
  const initialMaxInterval = await page.getByRole("textbox", { name: "Maximum interval" }).inputValue();

  // Change title
  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();

  // Change retention
  const retentionField = page.getByRole("textbox", { name: "Retention" });
  await retentionField.click();
  await retentionField.fill("85");
  await retentionField.blur();

  // Change weights
  const weightsField = page.getByRole("textbox", { name: "Weights" });
  await weightsField.click();
  await weightsField.fill("0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8");
  await weightsField.blur();

  // Change first learning step
  const learningStepField = page.getByRole("textbox", { name: "Amount for learning step number 1" });
  await learningStepField.click();
  await learningStepField.fill("999");
  await learningStepField.blur();

  // Change first relearning step
  const relearningStepField = page.getByRole("textbox", { name: "Amount for relearning step number 1" });
  await relearningStepField.click();
  await relearningStepField.fill("888");
  await relearningStepField.blur();

  // Change maximum interval
  const maxIntervalField = page.getByRole("textbox", { name: "Maximum interval" });
  await maxIntervalField.click();
  await maxIntervalField.fill("36500");
  await maxIntervalField.blur();

  // Click "Discard" to reset the form
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  // Verify form reset to original persisted values
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(algorithmTitle);
  await expect(page.getByRole("textbox", { name: "Retention" })).toHaveValue(initialRetention);
  await expect(page.getByRole("textbox", { name: "Weights" })).toHaveValue(initialWeights);
  await expect(page.getByRole("textbox", { name: "Amount for learning step number 1" })).toHaveValue(
    initialLearningStep,
  );
  await expect(page.getByRole("textbox", { name: "Amount for relearning step number 1" })).toHaveValue(
    initialRelearningStep,
  );
  await expect(page.getByRole("textbox", { name: "Maximum interval" })).toHaveValue(initialMaxInterval);
});
