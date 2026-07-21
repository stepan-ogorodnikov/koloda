import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createAlgorithm, createTemplate, openNewDeckDialog, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function fillAndSubmitDeck(
  page: Page,
  dialog: Locator,
  title: string,
  options: { preset?: string; template?: string } = {},
) {
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  if (options.preset) {
    await dialog.getByRole("button", { name: /Preset$/ }).click();
    await page.getByRole("option", { name: options.preset, exact: true }).click();
  }

  if (options.template) {
    await dialog.getByRole("button", { name: /Template$/ }).click();
    await page.getByRole("option", { name: options.template, exact: true }).click();
  }

  await dialog.getByRole("button", { name: "Add deck", exact: true }).click();
  await dialog.getByRole("link", { name: "Go to the new deck", exact: true }).click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

test("validates required title and adds decks with default and custom options", async ({ page }) => {
  await setupApp(page);

  // One-time setup: create a custom algorithm and template used by later cases.
  await createAlgorithm(page, "Custom Algorithm");
  await createTemplate(page, "Custom Template");

  // Validation: empty title
  const dialog = await openNewDeckDialog(page);
  const titleField = dialog.getByLabel("Title", { exact: true });
  await titleField.click();
  await titleField.clear();
  await titleField.blur();

  await dialog.getByRole("button", { name: "Add deck", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "New deck", exact: true })).toBeVisible();

  // Success 1: default preset and template
  await fillAndSubmitDeck(page, dialog, "Deck With Defaults");

  // Success 2: custom preset
  const dialog2 = await openNewDeckDialog(page);
  await fillAndSubmitDeck(page, dialog2, "Deck With Custom Algorithm", { preset: "Custom Algorithm" });

  // Success 3: custom template
  const dialog3 = await openNewDeckDialog(page);
  await fillAndSubmitDeck(page, dialog3, "Deck With Custom Template", { template: "Custom Template" });
});
