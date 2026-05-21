import { expect, test } from "@playwright/test";
import { openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("rejects empty deck title", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Decks");

  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const titleField = dialog.getByLabel("Title", { exact: true });
  await titleField.click();
  await titleField.clear();
  await titleField.blur();

  await page.getByRole("button", { name: "Add deck", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "New deck", exact: true })).toBeVisible();
});

test("adds a deck with default preset and template", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New deck", exact: true })).toBeVisible();

  await dialog.getByLabel("Title", { exact: true }).fill("My Test Deck");

  const addButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: "My Test Deck", exact: true })).toBeVisible();
});

test("adds a deck with custom preset", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Presets");
  await page.getByRole("button", { name: "New preset", exact: true }).click();
  const algoDialog = page.getByRole("dialog");
  await expect(algoDialog).toBeVisible();
  await algoDialog.getByLabel("Title", { exact: true }).fill("Custom Algorithm");
  await algoDialog.getByRole("button", { name: "Create", exact: true }).click();
  await algoDialog.getByRole("link", { name: "Go to the new preset", exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);

  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill("Deck With Custom Algorithm");

  await dialog.getByRole("button", { name: /Preset$/ }).click();
  const algoOption = page.getByRole("option", { name: "Custom Algorithm", exact: true });
  await expect(algoOption).toBeVisible();
  await algoOption.click();

  const addButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: "Deck With Custom Algorithm", exact: true })).toBeVisible();
});

test("adds a deck with custom template", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const templateDialog = page.getByRole("dialog");
  await expect(templateDialog).toBeVisible();
  await templateDialog.getByLabel("Title", { exact: true }).fill("Custom Template");
  await templateDialog.getByRole("button", { name: "Create", exact: true }).click();
  await templateDialog.getByRole("link", { name: "Go to the new template", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill("Deck With Custom Template");

  await dialog.getByRole("button", { name: /Template$/ }).click();
  const templateOption = page.getByRole("option", { name: "Custom Template", exact: true });
  await expect(templateOption).toBeVisible();
  await templateOption.click();

  const addButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: "Deck With Custom Template", exact: true })).toBeVisible();
});
