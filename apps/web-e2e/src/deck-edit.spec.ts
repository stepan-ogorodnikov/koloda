import { expect, test } from "@playwright/test";
import { createDeck, openSection } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("edits deck title, algorithm, and template via the Details tab and verifies persistence", async ({ page }) => {
  const deckTitle = "E2E Edit Deck";
  const updatedTitle = "E2E Updated Deck";
  const algorithmTitle = "E2E Algorithm";
  const templateTitle = "E2E Template";

  await setupWeb(page);

  // Create a second algorithm to pick later
  await openSection(page, "Presets");
  await page.getByRole("button", { name: "New preset", exact: true }).click();
  const algoDialog = page.getByRole("dialog");
  await expect(algoDialog).toBeVisible();
  await algoDialog.getByLabel("Title", { exact: true }).fill(algorithmTitle);
  await algoDialog.getByRole("button", { name: "Create", exact: true }).click();
  await algoDialog.getByRole("link", { name: "Go to the new preset", exact: true }).click();
  await expect(page).toHaveURL(
    /\/algorithms\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  // Create a second template to pick later
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const templateDialog = page.getByRole("dialog");
  await expect(templateDialog).toBeVisible();
  await templateDialog.getByLabel("Title", { exact: true }).fill(templateTitle);
  await templateDialog.getByRole("button", { name: "Create", exact: true }).click();
  await templateDialog.getByRole("link", { name: "Go to the new template", exact: true }).click();
  await expect(page).toHaveURL(
    /\/templates\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  // Create a deck
  await createDeck(page, deckTitle);

  const detailsTab = page.getByRole("tab", { name: "Details", exact: true });
  await detailsTab.click();
  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });

  // Verify initial default values (button accessible names are "{value} {label}")
  // New decks default to the seeded learning defaults: preset "Simple", template "Type".
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(deckTitle);
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText("Simple");
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText("Type");

  // Change title, algorithm, and template all at once
  const titleField = detailsPanel.getByRole("textbox", { name: "Title", exact: true });
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();

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
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText(algorithmTitle);
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText(templateTitle);
});
