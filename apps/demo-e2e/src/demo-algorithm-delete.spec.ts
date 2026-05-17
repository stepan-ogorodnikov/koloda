import { expect, test, type Page } from "@playwright/test";
import { openSection, setupDemo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
    window.localStorage.setItem("motion", "off");
  });
});

async function createAlgorithm(page: Page, title: string) {
  await openSection(page, "Presets");

  await page.getByRole("button", { name: "New preset", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new preset", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/algorithms\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

async function createDeckWithAlgorithm(page: Page, deckTitle: string, algorithmTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  // Select the specified algorithm
  await dialog.getByRole("button", { name: /Preset$/ }).click();
  const option = page.getByRole("option", { name: algorithmTitle, exact: true });
  await expect(option).toBeVisible();
  await option.click();

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();
}

test("deletes an algorithm with successor selection when in use by a deck", async ({ page }) => {
  const algorithmTitle = "E2E In-Use Algorithm";
  const deckTitle = "E2E Algorithm Deck";

  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Create an algorithm and a deck using it
  await createAlgorithm(page, algorithmTitle);
  await createDeckWithAlgorithm(page, deckTitle, algorithmTitle);

  // Stage 3 — Navigate to the algorithm and try to delete
  await openSection(page, "Presets");
  await page.getByRole("link", { name: algorithmTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);

  const deleteTrigger = page.getByRole("button", { name: "Delete preset", exact: true });
  await expect(deleteTrigger).toBeVisible();
  await deleteTrigger.click();

  // Stage 4 — Confirm deletion
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

  // Stage 6 — Verify redirect to /algorithms
  await expect(page).toHaveURL(/\/algorithms$/);

  // Stage 7 — Verify the algorithm no longer appears
  await expect(page.getByRole("link", { name: algorithmTitle, exact: true })).not.toBeVisible();
});
