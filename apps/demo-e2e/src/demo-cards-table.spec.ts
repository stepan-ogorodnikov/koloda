import { expect, type Locator, type Page, test } from "@playwright/test";
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

function cardRows(page: Page): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) });
}

async function createDeckWithCards(page: Page, deckTitle: string, cards: Array<{ front: string; back: string }>) {
  await setupDemo(page);
  await openSection(page, "Decks");

  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const createDeckDialog = page.getByRole("dialog");
  await expect(createDeckDialog).toBeVisible();
  await createDeckDialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await createDeckDialog.getByRole("button", { name: "Add deck", exact: true }).click();
  await createDeckDialog.getByRole("link", { name: "Go to the new deck", exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);

  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await expect(cardsTab).toBeVisible();
  await cardsTab.click();

  for (const card of cards) {
    await addCard(page, card.front, card.back);
  }
}

async function openFilters(page: Page) {
  await page.getByRole("button", { name: "Filters" }).click();
  const filtersPopover = page.getByRole("dialog");
  await expect(filtersPopover).toBeVisible();
  return filtersPopover;
}

test("filters cards by state", async ({ page }) => {
  const deckTitle = "E2E Filter Deck";

  await createDeckWithCards(page, deckTitle, [
    { front: "Filter Test One", back: "A1" },
    { front: "Filter Test Two", back: "A2" },
    { front: "Filter Test Three", back: "A3" },
  ]);

  const rows = cardRows(page);
  await expect(rows).toHaveCount(3);
  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(3);

  // Open filters popover and verify default state checkboxes
  const filtersPopover = await openFilters(page);

  const newCheckbox = filtersPopover.getByRole("checkbox", { name: "New", exact: true });
  const learningCheckbox = filtersPopover.getByRole("checkbox", { name: "Learning", exact: true });
  await expect(newCheckbox).not.toBeChecked();
  await expect(learningCheckbox).not.toBeChecked();
  await expect(filtersPopover.getByRole("checkbox", { name: "Relearning", exact: true })).toBeVisible();
  await expect(filtersPopover.getByRole("checkbox", { name: "Review", exact: true })).toBeVisible();

  // Filter by "Learning" — no cards are "Learning", so table should be empty
  await learningCheckbox.click({ force: true });
  await expect(learningCheckbox).toBeChecked();
  await expect(rows).toHaveCount(0);

  // Switch to "New" filter — all three cards are "New", so they should reappear
  await learningCheckbox.click({ force: true });
  await newCheckbox.click({ force: true });
  await expect(learningCheckbox).not.toBeChecked();
  await expect(newCheckbox).toBeChecked();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "Filter Test One" })).toBeVisible();
  await expect(rows.filter({ hasText: "Filter Test Two" })).toBeVisible();
  await expect(rows.filter({ hasText: "Filter Test Three" })).toBeVisible();

  // Close filters popover
  await page.keyboard.press("Escape");
  await expect(filtersPopover).not.toBeVisible();
});

test("filters cards by due status", async ({ page }) => {
  const deckTitle = "E2E Due Filter Deck";

  await createDeckWithCards(page, deckTitle, [
    { front: "Due Card One", back: "A1" },
    { front: "Due Card Two", back: "A2" },
  ]);

  const rows = cardRows(page);
  await expect(rows).toHaveCount(2);

  const filtersPopover = await openFilters(page);

  const overdueCheckbox = filtersPopover.getByRole("checkbox", { name: "Overdue", exact: true });
  const notDueCheckbox = filtersPopover.getByRole("checkbox", { name: "Not due yet", exact: true });
  await expect(overdueCheckbox).not.toBeChecked();
  await expect(notDueCheckbox).not.toBeChecked();

  // Filter by "Overdue" — no cards are overdue, so table should be empty
  await overdueCheckbox.click({ force: true });
  await expect(overdueCheckbox).toBeChecked();
  await expect(rows).toHaveCount(0);

  // Switch to "Not due" yet filter — both cards are new/not due, so they reappear
  await overdueCheckbox.click({ force: true });
  await notDueCheckbox.click({ force: true });
  await expect(overdueCheckbox).not.toBeChecked();
  await expect(notDueCheckbox).toBeChecked();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Due Card One" })).toBeVisible();
  await expect(rows.filter({ hasText: "Due Card Two" })).toBeVisible();

  // Close filters popover
  await page.keyboard.press("Escape");
  await expect(filtersPopover).not.toBeVisible();
});

test("sorts cards by column", async ({ page }) => {
  const deckTitle = "E2E Sort Deck";

  await createDeckWithCards(page, deckTitle, [
    { front: "B Sort Card", back: "B" },
    { front: "A Sort Card", back: "A" },
    { front: "C Sort Card", back: "C" },
  ]);

  // Click the "Front" column header to sort ascending
  const frontHeader = page.getByRole("columnheader", { name: /^Front/ });
  await expect(frontHeader).toBeVisible();
  await frontHeader.click();

  // Verify cards are now sorted alphabetically by "Front"
  const rows = cardRows(page);
  await expect(rows.nth(0)).toContainText("A Sort Card");
  await expect(rows.nth(1)).toContainText("B Sort Card");
  await expect(rows.nth(2)).toContainText("C Sort Card");
});

test("searches cards by content", async ({ page }) => {
  const deckTitle = "E2E Search Deck";

  await createDeckWithCards(page, deckTitle, [
    { front: "Searchable Alpha", back: "A" },
    { front: "Searchable Beta", back: "B" },
    { front: "Other Gamma", back: "C" },
  ]);

  // Search for "Searchable" — should match two cards
  const searchInput = page.getByRole("searchbox", { name: "Search cards" });
  await expect(searchInput).toBeVisible();
  await searchInput.click();
  await searchInput.fill("Searchable");

  const rows = cardRows(page);
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole("row").filter({ hasText: "Searchable Alpha" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Searchable Beta" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Other Gamma" })).not.toBeVisible();

  // Clear search — all three cards should reappear
  await searchInput.clear();
  await searchInput.fill("");

  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("row").filter({ hasText: "Other Gamma" })).toBeVisible();
});

test("toggles column visibility in the cards table", async ({ page }) => {
  const deckTitle = "E2E Columns Deck";
  await createDeckWithCards(page, deckTitle, [{ front: "Column Test", back: "answer" }]);

  // Open columns dialog
  await page.getByRole("button", { name: "Columns" }).click();

  const columnsDialog = page.getByRole("dialog");
  await expect(columnsDialog).toBeVisible();

  await expect(columnsDialog.getByRole("checkbox", { name: "Status" })).toBeVisible();
  await expect(columnsDialog.getByRole("checkbox", { name: "Due" })).toBeVisible();
  await expect(columnsDialog.getByRole("checkbox", { name: "Created" })).toBeVisible();
  await expect(columnsDialog.getByRole("checkbox", { name: "Updated" })).toBeVisible();

  const createdCheckbox = columnsDialog.getByRole("checkbox", { name: "Created" });
  await expect(createdCheckbox).not.toBeChecked();
  await expect(page.getByRole("columnheader", { name: "Created", exact: true })).not.toBeVisible();

  // Enable "Created" column
  await createdCheckbox.click({ force: true });
  await expect(createdCheckbox).toBeChecked();

  // Close dialog and verify "Created" column is visible
  await page.keyboard.press("Escape");
  await expect(columnsDialog).not.toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Created", exact: true })).toBeVisible();

  // Reopen columns dialog and disable "Created" column
  await page.getByRole("button", { name: "Columns" }).click();
  await expect(columnsDialog).toBeVisible();
  await columnsDialog.getByRole("checkbox", { name: "Created" }).click({ force: true });
  await expect(columnsDialog.getByRole("checkbox", { name: "Created" })).not.toBeChecked();

  // Close dialog and verify "Created" column is hidden
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Created", exact: true })).not.toBeVisible();
});
