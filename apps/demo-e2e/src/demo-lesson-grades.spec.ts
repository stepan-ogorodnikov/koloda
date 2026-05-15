import { expect, test, type Page } from "@playwright/test";
import { openSection, setupDemo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
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

  await page.keyboard.press("Escape");
  await expect(addCardDialog).not.toBeVisible();
}

async function setLearnAheadToZero(page: Page) {
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();

  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  await minutesField.click();
  await minutesField.clear();
  await minutesField.fill("0");
  await minutesField.blur();

  const saveButton = page.locator("form").getByRole("button", { name: "Save" });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn ahead limit")).toBeVisible();
}

test("grades cards with all four FSRS grades and verifies persisted state", async ({ page }) => {
  const deckTitle = "Grading E2E Deck";

  // Stage 1 — Set up demo and disable learn-ahead
  await setupDemo(page);
  await setLearnAheadToZero(page);

  // Stage 2 — Create a deck
  await openSection(page, "Decks");

  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const createDeckDialog = page.getByRole("dialog");
  await expect(createDeckDialog).toBeVisible();
  await createDeckDialog.getByLabel("Title", { exact: true }).fill(deckTitle);

  await createDeckDialog.getByRole("button", { name: "Add deck", exact: true }).click();
  await createDeckDialog.getByRole("link", { name: "Go to the new deck", exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: deckTitle, exact: true })).toBeVisible();

  // Stage 3 — Add four cards to the deck
  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await expect(cardsTab).toBeVisible();
  await cardsTab.click();

  await addCard(page, "1+1", "2");
  await addCard(page, "2+2", "4");
  await addCard(page, "3+3", "6");
  await addCard(page, "4+4", "8");

  // Stage 4 — Navigate to dashboard and start a lesson
  await openSection(page, "Dashboard");

  const lessonBadge = page.getByRole("button", { name: "4" }).first();
  await expect(lessonBadge).toBeVisible({ timeout: 10_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await expect(lessonDialog.getByRole("heading", { name: "Study cards" })).toBeVisible();

  await lessonDialog.getByRole("button", { name: "Start" }).click();

  // Stage 5 — Grade four cards, one per FSRS grade.
  // Learn-ahead is 0 so each card appears exactly once.
  const grades: ("Again" | "Hard" | "Good" | "Easy")[] = ["Again", "Hard", "Good", "Easy"];
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  for (let i = 0; i < 4; i++) {
    await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

    if (await doneMessage.isVisible().catch(() => false)) break;

    await backTextbox.fill("test");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: grades[i] }).click();
  }

  // Stage 6 — Lesson completion
  await expect(doneMessage).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Stage 7 — Navigate back to the deck and verify card states persisted
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);

  await cardsTab.click();

  // FSRS state transitions for new cards:
  // Again → Learning, Hard → Learning, Good → Learning, Easy → Review
  // (Good stays in Learning because it has remaining learning steps;
  //  only Easy graduates directly to Review.)
  const learningBadges = page.getByRole("row").locator("text=Learning");
  const reviewBadges = page.getByRole("row").locator("text=Review");
  const newBadges = page.getByRole("row").locator("text=New");
  await expect(learningBadges).toHaveCount(3);
  await expect(reviewBadges).toHaveCount(1);
  await expect(newBadges).toHaveCount(0);
});