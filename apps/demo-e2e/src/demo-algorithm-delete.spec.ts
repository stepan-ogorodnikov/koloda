import { expect, test } from "@playwright/test";
import { createAlgorithm, createDeckWithAlgorithm, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes an algorithm with successor selection when in use by a deck", async ({ page }) => {
  const algorithmTitle = "E2E In-Use Algorithm";
  const deckTitle = "E2E Algorithm Deck";

  await setupDemo(page);
  await createAlgorithm(page, algorithmTitle);
  await createDeckWithAlgorithm(page, deckTitle, algorithmTitle);

  // Navigate to the algorithm and try to delete
  await openSection(page, "Presets");
  await page.getByRole("link", { name: algorithmTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);

  const deleteTrigger = page.getByRole("button", { name: "Delete preset", exact: true });
  await expect(deleteTrigger).toBeVisible();
  await deleteTrigger.click();

  // Confirm deletion
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();

  // The successor select already defaults to the first available algorithm
  // Verify a successor is shown in the select button
  const successorButton = deleteDialog.getByRole("button", { name: "Successor preset" });
  await expect(successorButton).toBeVisible();

  const deleteButton = deleteDialog.getByRole("button", { name: "Delete preset", exact: true });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  // Wait for dialog to close after successful deletion
  await expect(deleteDialog).not.toBeVisible();

  // Verify redirect to "/algorithms"
  await expect(page).toHaveURL(/\/algorithms$/);

  // Verify the algorithm no longer appears
  await expect(page.getByRole("link", { name: algorithmTitle, exact: true })).not.toBeVisible();
});
