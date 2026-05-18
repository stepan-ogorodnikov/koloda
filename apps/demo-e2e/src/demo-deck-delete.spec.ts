import { expect, test } from "@playwright/test";
import { createDeck, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes a deck with no cards and redirects to /decks", async ({ page }) => {
  const deckTitle = "E2E Delete Deck";

  await setupDemo(page);
  await createDeck(page, deckTitle);

  // Navigate to the "Details" tab
  const detailsTab = page.getByRole("tab", { name: "Details", exact: true });
  await expect(detailsTab).toBeVisible();
  await detailsTab.click();

  // Open the delete dialog
  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });
  await detailsPanel.getByRole("button", { name: "Delete deck", exact: true }).click();

  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("Are you sure you want to delete this deck")).toBeVisible();

  // Confirm deletion
  await deleteDialog.getByRole("button", { name: "Delete deck", exact: true }).click();

  // Verify redirect to "/decks"
  await expect(page).toHaveURL(/\/decks$/);

  // Verify the deck no longer appears in the list
  await expect(page.getByRole("link", { name: deckTitle, exact: true })).not.toBeVisible();
});
