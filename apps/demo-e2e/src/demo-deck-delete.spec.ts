import { expect, type Page, test } from "@playwright/test";
import { openSection, setupDemo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
  });
});

async function createDeck(page: Page, title: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

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
