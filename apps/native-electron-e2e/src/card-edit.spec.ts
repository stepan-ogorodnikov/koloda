import { expect, test } from "./fixtures";
import { createDeckWithCard, openSection, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("edits card content fields and verifies changes persist", async ({ page }) => {
  const deckTitle = "E2E Edit Card Deck";
  const originalFront = "Original Front";
  const originalBack = "Original Back";
  const updatedFront = "Updated Front Content";
  const updatedBack = "Updated Back Content";

  await setupApp(page);
  await createDeckWithCard(page, deckTitle, originalFront, originalBack);

  // Open card edit dialog
  await page.getByRole("button", { name: "Edit card" }).click();

  const editDialog = page.getByRole("dialog");
  await expect(editDialog).toBeVisible();

  // Verify current field values and update them
  const frontField = editDialog.getByRole("textbox", { name: "Front" });
  const backField = editDialog.getByRole("textbox", { name: "Back" });

  await expect(frontField).toHaveValue(originalFront);
  await expect(backField).toHaveValue(originalBack);

  await frontField.click();
  await frontField.clear();
  await page.keyboard.type(updatedFront);

  await backField.click();
  await backField.clear();
  await page.keyboard.type(updatedBack);

  // Save changes
  await editDialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(editDialog).not.toBeVisible();

  // Verify changes persist after navigation
  await openSection(page, "Dashboard");
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();

  await page.getByRole("button", { name: "Edit card" }).click();

  const reopenedDialog = page.getByRole("dialog");
  await expect(reopenedDialog).toBeVisible();
  await expect(reopenedDialog.getByRole("textbox", { name: "Front" })).toHaveValue(updatedFront);
  await expect(reopenedDialog.getByRole("textbox", { name: "Back" })).toHaveValue(updatedBack);
});

test("opens card preview and verifies content in lesson-like format", async ({ page }) => {
  const deckTitle = "E2E Preview Deck";
  const cardFront = "Preview Front Content";
  const cardBack = "Preview Back Content";

  await setupApp(page);
  await createDeckWithCard(page, deckTitle, cardFront, cardBack);

  // Open card preview
  await page.getByRole("button", { name: "Preview Card" }).click();
  const previewDialog = page.getByRole("dialog");
  await expect(previewDialog).toBeVisible();

  // Verify "Front" is visible in the preview
  await expect(previewDialog.getByText(cardFront)).toBeVisible();

  // Reveal the answer
  await previewDialog.getByRole("button", { name: "Continue" }).click();

  // Verify "Back" is now visible
  await expect(previewDialog.getByText(cardBack)).toBeVisible();

  // Close the preview
  await page.keyboard.press("Escape");
  await expect(previewDialog).not.toBeVisible();
});
