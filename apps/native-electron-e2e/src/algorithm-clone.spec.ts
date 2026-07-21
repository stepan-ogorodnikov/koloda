import { expect, test } from "./fixtures";
import { createAlgorithm, openSection, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("clones an existing algorithm and verifies copied parameters", async ({ page }) => {
  const sourceTitle = "E2E Source Algorithm";
  const clonedTitle = "E2E Cloned Algorithm";
  const sourceRetention = "85";

  await setupApp(page);
  await createAlgorithm(page, sourceTitle);

  // Modify algorithm before cloning
  const retentionField = page.getByRole("textbox", { name: "Retention" });
  await retentionField.click();
  await retentionField.fill(sourceRetention);
  await retentionField.blur();

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Clone the algorithm
  const cloneTrigger = page.getByRole("button", { name: "Clone preset", exact: true });
  await expect(cloneTrigger).toBeVisible();
  await cloneTrigger.click();

  const cloneDialog = page.getByRole("dialog");
  await expect(cloneDialog).toBeVisible();

  await cloneDialog.getByLabel("Title", { exact: true }).fill(clonedTitle);

  const cloneButton = cloneDialog.getByRole("button", { name: "Clone", exact: true });
  await expect(cloneButton).toBeEnabled();
  await cloneButton.click();

  // Navigate to the new algorithm
  await expect(cloneDialog.getByRole("link", { name: "Go to the new preset", exact: true })).toBeVisible();
  await cloneDialog.getByRole("link", { name: "Go to the new preset", exact: true }).click();

  // Verify content
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);
  await expect(page.getByRole("heading", { name: clonedTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Retention" })).toHaveValue(sourceRetention);

  // Verify presence in the list of algorithms
  await openSection(page, "Presets");
  await expect(page.getByRole("link", { name: sourceTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: clonedTitle, exact: true })).toBeVisible();
});
