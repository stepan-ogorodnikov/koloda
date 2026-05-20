import { expect, test } from "@playwright/test";
import { createDeck, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("discards changes to deck details and resets form to persisted state", async ({ page }) => {
  const deckTitle = "E2E Reset Deck";
  const updatedTitle = "Updated Title";
  const algorithmTitle = "E2E Reset Algorithm";
  const templateTitle = "E2E Reset Template";

  await setupDemo(page);

  // Create a second algorithm to pick later
  await openSection(page, "Presets");
  await page.getByRole("button", { name: "New preset", exact: true }).click();
  const algoDialog = page.getByRole("dialog");
  await expect(algoDialog).toBeVisible();
  await algoDialog.getByLabel("Title", { exact: true }).fill(algorithmTitle);
  await algoDialog.getByRole("button", { name: "Create", exact: true }).click();
  await algoDialog.getByRole("link", { name: "Go to the new preset", exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);

  // Create a second template to pick later
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const templateDialog = page.getByRole("dialog");
  await expect(templateDialog).toBeVisible();
  await templateDialog.getByLabel("Title", { exact: true }).fill(templateTitle);
  await templateDialog.getByRole("button", { name: "Create", exact: true }).click();
  await templateDialog.getByRole("link", { name: "Go to the new template", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Create a deck
  await createDeck(page, deckTitle);
  const detailsTab = page.getByRole("tab", { name: "Details", exact: true });
  await detailsTab.click();
  const detailsPanel = page.getByRole("tabpanel", { name: "Details", exact: true });

  // Verify initial default values
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(deckTitle);
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText("Default");
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText("Default");

  // Change all 3 fields
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

  // Click "Discard" to reset the form
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  // Verify form reset to original persisted values
  await expect(detailsPanel.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(deckTitle);
  await expect(detailsPanel.getByRole("button", { name: /Preset$/ })).toContainText("Default");
  await expect(detailsPanel.getByRole("button", { name: /Template$/ })).toContainText("Default");
});
