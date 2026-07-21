import { expect, test } from "./fixtures";
import { addCard, createDeck, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes a single card via the table row and verifies removal", async ({ page }) => {
  const deckTitle = "E2E Delete Card Deck";
  const cardFront = "Card To Delete";

  await setupApp(page);
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, cardFront, "answer1");
  await addCard(page, "Keep Me", "answer2");

  // Verify both cards are present in the table
  await expect(page.getByRole("row").filter({ hasText: cardFront })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Keep Me" })).toBeVisible();

  // Delete the first card via the table row delete button
  await page.getByRole("button", { name: "Delete card" }).first().click();

  const deletePopover = page.getByRole("dialog");
  await expect(deletePopover).toBeVisible();
  await deletePopover.getByRole("button", { name: "Delete", exact: true }).click();

  // Verify the deleted card no longer appears
  await expect(page.getByRole("row").filter({ hasText: cardFront })).not.toBeVisible();

  // Verify the second card still exists
  await expect(page.getByRole("row").filter({ hasText: "Keep Me" })).toBeVisible();
});

test("bulk deletes multiple selected cards", async ({ page }) => {
  const deckTitle = "E2E Bulk Delete Deck";

  await setupApp(page);
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, "Card One", "ans1");
  await addCard(page, "Card Two", "ans2");
  await addCard(page, "Card Three", "ans3");

  // Verify three cards exist
  const deleteButtons = page.getByRole("button", { name: "Delete card" });
  await expect(deleteButtons).toHaveCount(3);

  // Select all three cards via row checkboxes
  const rows = page.getByRole("row");

  // Rows include header row; get data rows (skip header)
  const dataRows = rows.filter({ has: page.getByRole("checkbox") });
  const rowCount = await dataRows.count();

  for (let i = 0; i < rowCount && i < 3; i++) {
    await dataRows.nth(i).getByRole("checkbox").check({ force: true });
  }

  // Verify selection bar appears and click bulk delete
  const selectionBarDelete = page.getByRole("button", { name: "Delete", exact: true }).first();
  await expect(selectionBarDelete).toBeVisible();
  await selectionBarDelete.click();

  // Confirm deletion in the popover
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText(/delete selected cards/i)).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();

  // Verify all cards are removed
  await expect(deleteButtons).toHaveCount(0);
});
