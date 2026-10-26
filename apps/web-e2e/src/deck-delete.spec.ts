import { expect, test } from "@playwright/test";
import { createDeck, createDeckWithCard, openSection } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes a deck with no cards and redirects to /decks", async ({ page }) => {
  const deckTitle = "E2E Delete Deck";

  await setupWeb(page);
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
  await expect(deleteDialog.getByText("Are you sure you want to delete this deck?", { exact: true })).toBeVisible();

  // Confirm deletion
  await deleteDialog.getByRole("button", { name: "Delete deck", exact: true }).click();

  // Verify redirect to "/decks"
  await expect(page).toHaveURL(/\/decks$/);

  // Verify the deck no longer appears in the list
  await expect(page.getByRole("link", { name: deckTitle, exact: true })).not.toBeVisible();
});

test("deletes a deck with a card, states the card count, and drops its Dashboard row", async ({ page }) => {
  const deckTitle = "E2E Delete Deck With Card";

  await setupWeb(page);
  await createDeckWithCard(page, deckTitle, "Front text", "Back text");

  // The Dashboard lists the deck before the delete
  await openSection(page, "Dashboard");
  const deckRow = page.getByRole("row").filter({ has: page.getByText(deckTitle, { exact: true }) });
  await expect(deckRow).toBeVisible();

  // Open the deck's delete dialog
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });
  await detailsPanel.getByRole("button", { name: "Delete deck", exact: true }).click();

  const deleteDialog = page.getByRole("dialog");
  await expect(
    deleteDialog.getByText("Are you sure you want to delete this deck and its 1 card with its reviews?", {
      exact: true,
    }),
  ).toBeVisible();

  // Confirm deletion
  await deleteDialog.getByRole("button", { name: "Delete deck", exact: true }).click();
  await expect(page).toHaveURL(/\/decks$/);

  // The Dashboard no longer lists the deck
  await openSection(page, "Dashboard");
  await expect(page.getByRole("columnheader", { name: "Deck", exact: true })).toBeVisible();
  await expect(deckRow).toHaveCount(0);
});
