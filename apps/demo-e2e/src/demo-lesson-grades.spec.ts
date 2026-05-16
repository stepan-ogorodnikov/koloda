import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectDeckCardCount,
  openSection,
  setLearnAheadLimit,
  setupDemo,
  startDeckLesson,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
    window.localStorage.setItem("motion", "off");
  });
});

async function addCard(page: Page, front: string, back: string) {
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

async function gradeLessonCards(page: Page, lessonDialog: Locator, grades: string[]) {
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

  const cardRows = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Delete card" }) });
  await expect(cardRows.filter({ hasText: "Learning" })).toHaveCount(3);
  await expect(cardRows.filter({ hasText: "Review" })).toHaveCount(1);
  await expect(cardRows.filter({ hasText: "New" })).toHaveCount(0);
});
