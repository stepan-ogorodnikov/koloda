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

async function addCard(page: Page, front: string, back: string) {
  await page.getByRole("button", { name: "Add cards" }).click();

  const addCardDialog = page.getByRole("dialog");
  await expect(addCardDialog).toBeVisible();

  await addCardDialog.getByRole("textbox", { name: "Front" }).click();
  await page.keyboard.type(front);
  await addCardDialog.getByRole("textbox", { name: "Back" }).click();
  await page.keyboard.type(back);

  await addCardDialog.getByRole("button", { name: "Create card" }).click();
  await expect(addCardDialog.getByRole("textbox", { name: "Front" })).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(addCardDialog).not.toBeVisible();
}

async function createDeck(page: Page, title: string) {
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const createDeckDialog = page.getByRole("dialog");
  await expect(createDeckDialog).toBeVisible();
  await createDeckDialog.getByLabel("Title", { exact: true }).fill(title);

  await createDeckDialog.getByRole("button", { name: "Add deck", exact: true }).click();
  await createDeckDialog.getByRole("link", { name: "Go to the new deck", exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await expect(cardsTab).toBeVisible();
  await cardsTab.click();
}

test("deletes a single card via the table row and verifies removal", async ({ page }) => {
  const deckTitle = "E2E Delete Card Deck";
  const cardFront = "Card To Delete";

  // Stage 1 — Set up demo and create a deck with two cards
  await setupDemo(page);
  await openSection(page, "Decks");
  await createDeck(page, deckTitle);
  await addCard(page, cardFront, "answer1");
  await addCard(page, "Keep Me", "answer2");

  // Stage 2 — Verify both cards are present in the table
  await expect(page.getByRole("row").filter({ hasText: cardFront })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Keep Me" })).toBeVisible();

  // Stage 3 — Delete the first card via the table row delete button
  await page.getByRole("button", { name: "Delete card" }).first().click();

  const deletePopover = page.getByRole("dialog");
  await expect(deletePopover).toBeVisible();
  await deletePopover.getByRole("button", { name: "Delete", exact: true }).click();

  // Stage 4 — Verify the deleted card no longer appears
  await expect(page.getByRole("row").filter({ hasText: cardFront })).not.toBeVisible();

  // Stage 5 — Verify the second card still exists
  await expect(page.getByRole("row").filter({ hasText: "Keep Me" })).toBeVisible();
});

test("bulk deletes multiple selected cards", async ({ page }) => {
  const deckTitle = "E2E Bulk Delete Deck";

  // Stage 1 — Set up demo and create a deck with three cards
  await setupDemo(page);
  await openSection(page, "Decks");
  await createDeck(page, deckTitle);
  await addCard(page, "Card One", "ans1");
  await addCard(page, "Card Two", "ans2");
  await addCard(page, "Card Three", "ans3");

  // Stage 2 — Verify three cards exist
  const deleteButtons = page.getByRole("button", { name: "Delete card" });
  await expect(deleteButtons).toHaveCount(3);

  // Stage 3 — Select all three cards via row checkboxes
  // The first checkbox in the table header selects all, but we select individual rows
  const rows = page.getByRole("row");
  // Rows include header row; get data rows (skip header)
  const dataRows = rows.filter({ has: page.getByRole("checkbox") });
  const rowCount = await dataRows.count();

  for (let i = 0; i < rowCount && i < 3; i++) {
    await dataRows.nth(i).getByRole("checkbox").check({ force: true });
  }

  // Stage 4 — Verify selection bar appears and click bulk delete
  const selectionBarDelete = page.getByRole("button", { name: "Delete", exact: true }).first();
  await expect(selectionBarDelete).toBeVisible();
  await selectionBarDelete.click();

  // Stage 5 — Confirm deletion in the popover
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText(/delete selected cards/i)).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();

  // Stage 6 — Verify all cards are removed
  await expect(deleteButtons).toHaveCount(0);
});
