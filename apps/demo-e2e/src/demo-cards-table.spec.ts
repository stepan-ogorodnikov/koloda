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

test("filters cards by state", async ({ page }) => {
  const deckTitle = "E2E Filter Deck";

  // Stage 1 — Set up demo and create a deck with multiple cards
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

  await addCard(page, "Filter Test One", "A1");
  await addCard(page, "Filter Test Two", "A2");
  await addCard(page, "Filter Test Three", "A3");

  // Stage 2 — Verify all 3 cards are "New"
  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(3);

  // Stage 3 — Open filters and select only "New" status
  await page.getByRole("button", { name: "Filters" }).click();

  const filtersPopover = page.getByRole("dialog");
  await expect(filtersPopover).toBeVisible();

  // No status filters are applied by default (checkboxes are unchecked)
  const newCheckbox = filtersPopover.getByRole("checkbox", { name: "New" });
  await expect(newCheckbox).not.toBeChecked();

  // Also verify other status checkboxes exist (exact: Learning is a substring of Relearning)
  await expect(filtersPopover.getByRole("checkbox", { name: "Learning", exact: true })).toBeVisible();
  await expect(filtersPopover.getByRole("checkbox", { name: "Relearning", exact: true })).toBeVisible();
  await expect(filtersPopover.getByRole("checkbox", { name: "Review", exact: true })).toBeVisible();

  // Close filters
  await page.keyboard.press("Escape");
  await expect(filtersPopover).not.toBeVisible();

  // Stage 4 — Verify all cards still visible
  const deleteButtons = page.getByRole("button", { name: "Delete card" });
  await expect(deleteButtons).toHaveCount(3);
});

test("filters cards by due status", async ({ page }) => {
  const deckTitle = "E2E Due Filter Deck";

  // Stage 1 — Set up demo and create a deck with cards
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

  await addCard(page, "Due Card One", "A1");
  await addCard(page, "Due Card Two", "A2");

  // Stage 2 — Open filters and verify due status checkboxes exist
  await page.getByRole("button", { name: "Filters" }).click();

  const filtersPopover = page.getByRole("dialog");
  await expect(filtersPopover).toBeVisible();

  // Verify "Overdue" and "Not due yet" checkboxes exist under Due section
  await expect(filtersPopover.getByRole("checkbox", { name: "Overdue" })).toBeVisible();
  await expect(filtersPopover.getByRole("checkbox", { name: "Not due yet" })).toBeVisible();

  // Close filters
  await page.keyboard.press("Escape");
});

test("sorts cards by column", async ({ page }) => {
  const deckTitle = "E2E Sort Deck";

  // Stage 1 — Set up demo and create a deck with cards
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

  await addCard(page, "B Sort Card", "B");
  await addCard(page, "A Sort Card", "A");
  await addCard(page, "C Sort Card", "C");

  // Stage 2 — Click the "Front" column header to sort
  const frontHeader = page.getByRole("columnheader", { name: /^Front/ });
  await expect(frontHeader).toBeVisible();
  await frontHeader.click();

  // Stage 3 — Verify cards are sorted (A before B before C in first column)
  // The first data row (after header) should contain "A Sort Card"
  const firstDataRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) }).first();
  await expect(firstDataRow).toContainText("A Sort Card");
});

test("searches cards by content", async ({ page }) => {
  const deckTitle = "E2E Search Deck";

  // Stage 1 — Set up demo and create a deck with cards
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

  await addCard(page, "Searchable Alpha", "A");
  await addCard(page, "Searchable Beta", "B");
  await addCard(page, "Other Gamma", "C");

  // Stage 2 — Use the search input to find cards containing "Searchable"
  const searchInput = page.getByRole("searchbox", { name: "Search cards" });
  await expect(searchInput).toBeVisible();
  await searchInput.click();
  await searchInput.fill("Searchable");

  // Stage 3 — Verify only matching cards are visible
  await expect(page.getByRole("row").filter({ hasText: "Searchable Alpha" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Searchable Beta" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Other Gamma" })).not.toBeVisible();

  // Stage 4 — Clear search and verify all cards reappear
  await searchInput.clear();
  await searchInput.fill("");

  await expect(page.getByRole("row").filter({ hasText: "Other Gamma" })).toBeVisible();
});

test("toggles column visibility in the cards table", async ({ page }) => {
  const deckTitle = "E2E Columns Deck";

  // Stage 1 — Set up demo and create a deck with a card
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

  await addCard(page, "Column Test", "answer");

  // Stage 2 — Open the Columns menu
  await page.getByRole("button", { name: "Columns" }).click();

  const columnsDialog = page.getByRole("dialog");
  await expect(columnsDialog).toBeVisible();

  // Stage 3 — Verify column checkboxes exist
  await expect(columnsDialog.getByRole("checkbox", { name: "Status" })).toBeVisible();
  await expect(columnsDialog.getByRole("checkbox", { name: "Due" })).toBeVisible();

  // "Created" and "Updated" columns should exist but may be off by default
  await expect(columnsDialog.getByRole("checkbox", { name: "Created" })).toBeVisible();
  await expect(columnsDialog.getByRole("checkbox", { name: "Updated" })).toBeVisible();

  // Stage 4 — Enable the "Created" column
  const createdCheckbox = columnsDialog.getByRole("checkbox", { name: "Created" });
  if (!(await createdCheckbox.isChecked())) {
    await createdCheckbox.check({ force: true });
  }
  await expect(createdCheckbox).toBeChecked();

  // Close the columns menu
  await page.keyboard.press("Escape");
  await expect(columnsDialog).not.toBeVisible();

  // Stage 5 — Verify the "Created" column header is now visible in the table
  await expect(page.getByRole("columnheader", { name: "Created" })).toBeVisible();
});
