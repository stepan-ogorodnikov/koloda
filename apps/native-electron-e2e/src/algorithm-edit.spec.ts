import { expect, test } from "./fixtures";
import { createAlgorithm, openSection, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("creates an algorithm, modifies parameters, and verifies persistence", async ({ page }) => {
  const algorithmTitle = "E2E Algorithm";
  const updatedTitle = "E2E Algorithm Updated";

  await setupApp(page);
  await createAlgorithm(page, algorithmTitle);

  // Modify parameters
  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(titleField).toBeVisible();
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();

  // Change retention
  const retentionField = page.getByRole("textbox", { name: "Retention" });
  await retentionField.click();
  await retentionField.fill("85");
  await retentionField.blur();

  // Save changes
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Verify persistence after navigation
  await openSection(page, "Dashboard");
  await openSection(page, "Presets");
  await page.getByRole("link", { name: updatedTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);

  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);
  await expect(page.getByRole("textbox", { name: "Retention" })).toHaveValue("85");
});
