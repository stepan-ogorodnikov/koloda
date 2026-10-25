import { expect, test } from "@playwright/test";
import { addCard, createDeck } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes a single card via the table row and verifies removal", async ({ page }) => {
  const deckTitle = "E2E Delete Card Deck";
  const cardFront = "Card To Delete";

  await setupWeb(page);
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

  await setupWeb(page);
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

test("deletes the last card in the stack view and shows the one before it", async ({ page }) => {
  const deckTitle = "E2E Stack Delete Deck";

  await setupWeb(page);
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, "Card One", "ans1");
  await addCard(page, "Card Two", "ans2");
  await addCard(page, "Card Three", "ans3");

  // WHY: the stack keeps the leaving card mounted until its exit ends, so wait for one form.
  const frontField = page.getByRole("textbox", { name: "Front" });
  const expectStackCard = async (front: string) => {
    await expect(frontField).toHaveCount(1);
    await expect(frontField).toHaveValue(front);
  };

  await page.getByLabel("Stack", { exact: true }).click();
  await expectStackCard("Card One");
  const nextCard = page.getByRole("button", { name: "Go to next card" });
  await nextCard.click();
  await expectStackCard("Card Two");
  await nextCard.click();
  await expectStackCard("Card Three");

  // Delete the last card from its details
  await page.getByRole("button", { name: "Delete card" }).click();
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(deleteDialog).not.toBeVisible();

  // The stack moves to the new last card
  await expectStackCard("Card Two");
  await expect(nextCard).toBeDisabled();
  await expect(page.getByRole("button", { name: "Go to previous card" })).toBeEnabled();
});
