import { expect, test } from "@playwright/test";
import { addCard, createDeck, createTemplate, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("locks template when card is added and unlocks when card is deleted", async ({ page }) => {
  test.setTimeout(60_000);

  const deckTitle = "Template Lock Deck";
  const templateTitle = "Lock Test Template";
  const cardFront = "Lock Test Card";

  await setupDemo(page);
  await createTemplate(page, templateTitle);
  await createDeck(page, deckTitle);

  // Assign template to deck
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: /Template$/ }).click();
  await page.getByRole("option", { name: templateTitle, exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Ensure template isn't locked
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await expect(page.getByText("Not locked", { exact: true })).toBeVisible();

  // Add card
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, cardFront, "answer");

  // Ensure template gets locked
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await page.reload();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  // Delete card
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.getByRole("button", { name: "Delete card" }).first().click();

  const deletePopover = page.getByRole("dialog");
  await expect(deletePopover).toBeVisible();
  await deletePopover.getByRole("button", { name: "Delete", exact: true }).click();

  // Ensure template gets unlocked again
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await page.reload();
  await expect(page.getByText("Not locked", { exact: true })).toBeVisible();
});
