import { expect, test } from "@playwright/test";
import {
  addCard,
  expectDeckCardCount,
  gradeLessonCards,
  openSection,
  setLearnAheadLimit,
  setupDemo,
  setupPageDefaults,
  startDeckLesson,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("grades cards with all four FSRS grades and verifies persisted state", async ({ page }) => {
  test.setTimeout(90_000);

  const deckTitle = "Grading E2E Deck";
  const grades = ["Again", "Hard", "Good", "Easy"];

  await setupDemo(page);
  await setLearnAheadLimit(page, 0, 0);

  await openSection(page, "Decks");

  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const createDeckDialog = page.getByRole("dialog");
  await expect(createDeckDialog).toBeVisible();
  await createDeckDialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await createDeckDialog.getByRole("button", { name: "Add deck", exact: true }).click();
  await createDeckDialog.getByRole("link", { name: "Go to the new deck", exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();

  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await expect(cardsTab).toBeVisible();
  await cardsTab.click();

  await addCard(page, "1+1", "2");
  await addCard(page, "2+2", "4");
  await addCard(page, "3+3", "6");
  await addCard(page, "4+4", "8");
  await expectDeckCardCount(page, 4);

  const lessonDialog = await startDeckLesson(page, deckTitle, 4);
  await gradeLessonCards(page, lessonDialog, grades);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await cardsTab.click();
  await expectDeckCardCount(page, 4);

  const rows = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) });
  await expect(rows.filter({ hasText: "Learning" })).toHaveCount(3);
  await expect(rows.filter({ hasText: "Review" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "New" })).toHaveCount(0);
});
