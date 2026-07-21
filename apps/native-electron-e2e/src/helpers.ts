import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export async function setupPageDefaults(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("scheme", "light");
    window.localStorage.setItem("motion", "off");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
}

export async function setupApp(page: Page) {
  await expect(page.getByText("Setting up your database", { exact: true })).toBeVisible();

  const startButton = page.getByRole("button", { name: "Get started", exact: true });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Learned today", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Templates", exact: true })).toBeVisible();
}

export async function openSection(page: Page, name: string) {
  const navigationLink = getNavigation(page, name);
  await expect(navigationLink).toBeVisible();
  await navigationLink.click();
}

export function getNavigation(page: Page, name: string): Locator {
  return page.getByRole("link", { name, exact: true }).first();
}

export async function addCard(page: Page, front: string, back: string) {
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

export async function createDeck(page: Page, title: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function createDeckWithCard(page: Page, deckTitle: string, cardFront: string, cardBack: string) {
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, cardFront, cardBack);
}

export async function createAlgorithm(page: Page, title: string) {
  await openSection(page, "Presets");

  await page.getByRole("button", { name: "New preset", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new preset", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/algorithms\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function openNewAlgorithmDialog(page: Page) {
  await openSection(page, "Presets");
  await page.getByRole("button", { name: "New preset", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New preset", exact: true })).toBeVisible();

  return dialog;
}

export async function openNewTemplateDialog(page: Page) {
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New template", exact: true })).toBeVisible();

  return dialog;
}

export async function openNewDeckDialog(page: Page) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New deck", exact: true })).toBeVisible();

  return dialog;
}

export async function createTemplate(page: Page, title: string) {
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new template", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

export async function createDeckWithTemplate(page: Page, deckTitle: string, templateTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await dialog.getByRole("button", { name: /Template$/ }).click();
  const option = page.getByRole("option", { name: templateTitle, exact: true });
  await expect(option).toBeVisible();
  await option.click();

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();
}

export async function createDeckWithAlgorithm(page: Page, deckTitle: string, algorithmTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await dialog.getByRole("button", { name: /Preset$/ }).click();
  const option = page.getByRole("option", { name: algorithmTitle, exact: true });
  await expect(option).toBeVisible();
  await option.click();

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();
}
