import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export async function setupPageDefaults(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
    window.localStorage.setItem("motion", "off");
  });
}

export async function setupDemo(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Setting up a demo", { exact: true })).toBeVisible();

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

export async function openLearningSettings(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Learning", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Minutes" })).toBeVisible();
}

export async function saveLearningSettings(page: Page) {
  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeEnabled();
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn ahead limit")).toBeVisible();
}

export async function setLearnAheadLimit(page: Page, hours: number, minutes: number) {
  await openLearningSettings(page);

  const hoursField = page.getByRole("textbox", { name: "Hours" });
  await hoursField.click();
  await hoursField.clear();
  await hoursField.fill(String(hours));
  await hoursField.blur();

  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  await minutesField.click();
  await minutesField.clear();
  await minutesField.fill(String(minutes));
  await minutesField.blur();

  await saveLearningSettings(page);
  await expect(hoursField).toHaveValue(String(hours));
  await expect(minutesField).toHaveValue(String(minutes));
}

export async function expectDeckCardCount(page: Page, count: number) {
  const cardRows = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) });
  await expect(cardRows).toHaveCount(count, { timeout: 15_000 });
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

export async function openLessonDialog(page: Page, deckTitle: string, newCardCount: number) {
  await openSection(page, "Dashboard");

  const deckRow = page.getByRole("row").filter({ has: page.getByText(deckTitle, { exact: true }) });
  await expect(deckRow).toBeVisible({ timeout: 15_000 });

  const lessonBadge = deckRow.getByRole("button", { name: String(newCardCount), exact: true }).first();
  await expect(lessonBadge).toBeEnabled({ timeout: 15_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await expect(lessonDialog.getByRole("heading", { name: "Study cards" })).toBeVisible();

  return lessonDialog;
}

export async function gradeLessonCards(page: Page, lessonDialog: Locator, grades: string[]) {
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  for (let i = 0; i < 10; i++) {
    await backTextbox.or(doneMessage).waitFor({ timeout: 15_000 });

    if (await doneMessage.isVisible().catch(() => false)) break;

    const grade = grades[i];
    if (!grade) break;

    await backTextbox.fill("test");
    await page.getByRole("button", { name: "Continue" }).click();

    const gradeButton = page.getByRole("button", { name: grade, exact: true });
    await expect(gradeButton).toBeVisible();
    await gradeButton.click();
  }

  await expect(doneMessage).toBeVisible({ timeout: 15_000 });
}

export async function startDeckLesson(page: Page, deckTitle: string, newCardCount: number) {
  const lessonDialog = await openLessonDialog(page, deckTitle, newCardCount);
  await lessonDialog.getByRole("button", { name: "Start" }).click();
  return lessonDialog;
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
