import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { createAlgorithm, createDeck, createTemplate, openSection } from "@koloda/e2e";
import { setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("edits deck title, notes, algorithm, and template via the Details tab and verifies persistence", async ({
  page,
}) => {
  const deckTitle = "E2E Edit Deck";
  const updatedTitle = "E2E Updated Deck";
  const algorithmTitle = "E2E Algorithm";
  const templateTitle = "E2E Template";
  const notes = "E2E deck notes";

  await setupApp(page);

  // Create a second algorithm and template to pick later
  await createAlgorithm(page, algorithmTitle);
  await createTemplate(page, templateTitle);

  // Create a deck
  await createDeck(page, deckTitle);

  const detailsTab = page.getByRole("tab", { name: "Details", exact: true });
  await detailsTab.click();
  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });

  // Verify initial default values (button accessible names are "{value} {label}")
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(deckTitle);
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText("Default");
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText("Default");

  // Change title, notes, algorithm, and template all at once
  const titleField = detailsPanel.getByRole("textbox", { name: "Title", exact: true });
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();
  const notesField = detailsPanel.getByRole("textbox", { name: "Notes", exact: true });
  await notesField.fill(notes);

  await detailsPanel.getByRole("button", { name: /Preset$/ }).click();
  const algoOption = page.getByRole("option", { name: algorithmTitle, exact: true });
  await expect(algoOption).toBeVisible();
  await algoOption.click();

  await detailsPanel.getByRole("button", { name: /Template$/ }).click();
  const templateOption = page.getByRole("option", { name: templateTitle, exact: true });
  await expect(templateOption).toBeVisible();
  await templateOption.click();

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  // Wait for the mutation to complete (Save button disappears via form reset)
  await expect(saveButton).not.toBeVisible();

  // The form must stay on the saved values so Discard restores the last save
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);
  await expect(notesField).toHaveValue(notes);
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText(algorithmTitle);
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText(templateTitle);

  // Discard restores the last saved values, not the pre-edit ones
  const draftTitle = "E2E Draft Title";
  await titleField.fill(draftTitle);
  await titleField.blur();
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await discardButton.click();
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);

  // Navigate away and back to verify persistence
  await openSection(page, "Dashboard");
  await openSection(page, "Decks");
  await page.getByRole("link", { name: updatedTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  await detailsTab.click();

  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);
  await expect(notesField).toHaveValue(notes);
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText(algorithmTitle);
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText(templateTitle);

  // An empty title is rejected on save, and the saved deck keeps its title
  await titleField.clear();
  await titleField.blur();
  await saveButton.click();
  await expect(page.locator("form").getByText("Title can't be empty", { exact: true })).toBeVisible();
  await discardButton.click();
  await expect(titleField).toHaveValue(updatedTitle);
  await expect(page.getByRole("link", { name: updatedTitle, exact: true })).toBeVisible();
});

test("shows not found for a missing deck link", async ({ page }) => {
  await setupApp(page);

  // WHY: resolve against the current origin; the Electron context has no `baseURL`.
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/decks/01900000-0000-7000-8000-0000000f423f`);

  await expect(page.getByRole("heading", { name: "Not found", exact: true })).toBeVisible();
});
