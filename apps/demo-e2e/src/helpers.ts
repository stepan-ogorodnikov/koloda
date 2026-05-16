import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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

export async function startDeckLesson(page: Page, deckTitle: string, newCardCount: number) {
  await openSection(page, "Dashboard");

  const deckRow = page.getByRole("row").filter({ has: page.getByText(deckTitle, { exact: true }) });
  await expect(deckRow).toBeVisible({ timeout: 15_000 });

  // Prefer the "New" (untouched) column; fall back to the first matching count in the row.
  const lessonBadge = deckRow.getByRole("button", { name: String(newCardCount), exact: true }).first();
  await expect(lessonBadge).toBeEnabled({ timeout: 15_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await expect(lessonDialog.getByRole("heading", { name: "Study cards" })).toBeVisible();
  await lessonDialog.getByRole("button", { name: "Start" }).click();

  return lessonDialog;
}
