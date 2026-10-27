import { expect, test } from "@playwright/test";
import { createAlgorithm, createDeckWithAlgorithm, openSection } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes an algorithm with successor selection when in use by a deck", async ({ page }) => {
  const algorithmTitle = "E2E In-Use Algorithm";
  const successorTitle = "E2E Successor Algorithm";
  const deckTitle = "E2E Algorithm Deck";

  await setupWeb(page);
  await createAlgorithm(page, successorTitle);
  await createAlgorithm(page, algorithmTitle);
  await createDeckWithAlgorithm(page, deckTitle, algorithmTitle);

  // Navigate to the algorithm and try to delete
  await openSection(page, "Presets");
  await page.getByRole("link", { name: algorithmTitle, exact: true }).click();
  await expect(page).toHaveURL(
    /\/algorithms\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  const deleteTrigger = page.getByRole("button", { name: "Delete preset", exact: true });
  await expect(deleteTrigger).toBeVisible();
  await deleteTrigger.click();

  // Confirm deletion
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();

  // Pick the successor
  const successorButton = deleteDialog.getByRole("button", { name: "Successor preset" });
  await expect(successorButton).toBeVisible();
  await successorButton.click();
  await page.getByRole("option", { name: successorTitle, exact: true }).click();

  const deleteButton = deleteDialog.getByRole("button", { name: "Delete preset", exact: true });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  // Wait for dialog to close after successful deletion
  await expect(deleteDialog).not.toBeVisible();

  // Verify redirect to "/algorithms"
  await expect(page).toHaveURL(/\/algorithms$/);

  // Verify the algorithm no longer appears
  await expect(page.getByRole("link", { name: algorithmTitle, exact: true })).not.toBeVisible();

  // The deck moved to the successor
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText(successorTitle);
});

test("prevents deleting the learning-default algorithm", async ({ page }) => {
  await setupWeb(page);

  await openSection(page, "Presets");
  await page.getByRole("link", { name: "Simple", exact: true }).click();
  await expect(page).toHaveURL(
    /\/algorithms\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  const deleteTrigger = page.getByRole("button", { name: "Delete preset", exact: true });
  await expect(deleteTrigger).toBeDisabled();
});

// WHY: the last-preset guard is not reachable alone in the UI: the default cannot be deleted, so the last preset left
// is always the default. Both hosts' integration tests cover that guard; this flow covers deleting an unused preset.
test("deletes an unused preset without asking for a successor", async ({ page }) => {
  const spareTitle = "E2E Spare Preset";

  await setupWeb(page);
  await createAlgorithm(page, spareTitle);

  const deleteTrigger = page.getByRole("button", { name: "Delete preset", exact: true });
  await deleteTrigger.click();

  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog.getByRole("button", { name: "Delete preset", exact: true })).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "Successor preset" })).not.toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete preset", exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms$/);
  await expect(page.getByRole("link", { name: spareTitle, exact: true })).not.toBeVisible();
});
