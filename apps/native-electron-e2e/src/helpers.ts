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

export function cardRows(page: Page): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) });
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

export async function createDeckWithCards(
  page: Page,
  deckTitle: string,
  cards: Array<{ front: string; back: string }>,
) {
  await createDeck(page, deckTitle);
  await page.getByRole("tab", { name: "Cards" }).click();
  for (const card of cards) {
    await addCard(page, card.front, card.back);
  }
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

export async function openLearningSettings(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Learning", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Minutes" })).toBeVisible();
}

export async function openHotkeysSettings(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Hotkeys", exact: true }).click();
  const kbds = page.locator("form kbd");
  await expect(kbds.first()).toBeVisible();
}

export function getHotkeyByLabel(page: Page, label: string) {
  const kbd = page.locator(`xpath=//div[normalize-space()='${label}']/following-sibling::div//kbd`);
  const container = kbd.locator("xpath=..");
  const editButton = kbd
    .locator("xpath=ancestor::div[contains(@class, 'flex-row') and contains(@class, 'items-center')]")
    .getByRole("button", { name: "Change hotkey" });

  return { kbd, container, editButton };
}

export async function editHotkey(page: Page, label: string, newKey: string) {
  const { editButton } = getHotkeyByLabel(page, label);
  await editButton.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press(newKey);

  await dialog.getByRole("button", { name: "Accept this hotkey" }).click();
  await expect(dialog).not.toBeVisible();
}

export async function dragTo(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Could not get bounding box for drag source or target");

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX, sourceY + 20, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

export async function reorderWithKeyboard(handle: Locator, direction: "up" | "down", steps: number) {
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await handle.press("Enter");
  for (let i = 0; i < steps; i++) {
    await handle.press(direction === "up" ? "ArrowUp" : "ArrowDown");
  }
  await handle.press("Enter");
}
