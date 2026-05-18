import { expect, test } from "@playwright/test";
import { createDeck, createTemplate, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("sets up the demo and reaches the core web sections", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Templates");
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();

  await openSection(page, "Decks");
  await expect(page).toHaveURL(/\/decks$/);
  await expect(page.getByRole("heading", { name: "Decks", exact: true })).toBeVisible();
});

test("creates a template from the templates screen", async ({ page }) => {
  const templateTitle = "Playwright Template";

  await setupDemo(page);
  await createTemplate(page, templateTitle);
  await expect(page.getByRole("textbox", { name: "Title", exact: true }).first()).toHaveValue(templateTitle);
  await expect(page.getByText("Not locked", { exact: true })).toBeVisible();
});

test("creates a deck from the decks screen", async ({ page }) => {
  const deckTitle = "Playwright Deck";

  await setupDemo(page);
  await createDeck(page, deckTitle);

  const detailsTab = page.getByRole("tab", { name: "Details", exact: true });
  await expect(detailsTab).toBeVisible();
  await detailsTab.click();

  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(deckTitle);
});
