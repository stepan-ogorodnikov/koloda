import { expect, type Page, test } from "@playwright/test";
import { openSection, setLearnAheadLimit, setupDemo } from "./helpers";

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

async function createDeck(page: Page, title: string) {
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const createDeckDialog = page.getByRole("dialog");
  await expect(createDeckDialog).toBeVisible();
  await createDeckDialog.getByLabel("Title", { exact: true }).fill(title);

  await createDeckDialog.getByRole("button", { name: "Add deck", exact: true }).click();
  await createDeckDialog.getByRole("link", { name: "Go to the new deck", exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await expect(cardsTab).toBeVisible();
  await cardsTab.click();
}

async function createDeckWithCards(page: Page, title: string, cards: Array<{ front: string; back: string }>) {
  await openSection(page, "Decks");
  await createDeck(page, title);

  for (const card of cards) {
    await addCard(page, card.front, card.back);
  }
}

async function openLessonInit(page: Page, deckTitle: string, newCardCount: number) {
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

async function startLesson(page: Page, deckTitle: string, newCardCount: number) {
  const lessonDialog = await openLessonInit(page, deckTitle, newCardCount);
  await lessonDialog.getByRole("button", { name: "Start" }).click();
  return lessonDialog;
}

test("adjusts card amounts in lesson init dialog and verifies expected counts", async ({ page }) => {
  const deckTitle = "E2E Amount Deck";

  await setupDemo(page);
  await setLearnAheadLimit(page, 0, 0);
  await createDeckWithCards(page, deckTitle, [
    { front: "Q1", back: "A1" },
    { front: "Q2", back: "A2" },
    { front: "Q3", back: "A3" },
  ]);

  // Open lesson init dialog and verify default count is 3
  const lessonDialog = await openLessonInit(page, deckTitle, 3);

  const newAmountInput = lessonDialog.getByRole("textbox", { name: "Amount of cards of type new" });
  await expect(newAmountInput).toHaveValue("3");

  // Reduce "New" card count to 1 and start lesson
  await newAmountInput.click();
  await newAmountInput.fill("1");
  await newAmountInput.blur();

  await lessonDialog.getByRole("button", { name: "Start" }).click();

  // Answer the single card and complete the lesson
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");
  await expect(backTextbox).toBeVisible({ timeout: 10_000 });
  await backTextbox.fill("A1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(doneMessage).toBeVisible();

  // Close the lesson dialog
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Navigate back to the deck and verify only 2 cards remain in "New" state
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();

  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(2);
});

test("terminates lesson mid-study with confirmation and returns to dashboard", async ({ page }) => {
  const deckTitle = "E2E Terminate Deck";

  await setupDemo(page);
  await setLearnAheadLimit(page, 0, 0);
  await createDeckWithCards(page, deckTitle, [{ front: "Termination Test Q", back: "Termination Test A" }]);
  const lessonDialog = await startLesson(page, deckTitle, 1);

  // Answer the card and reach the grade step
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  await expect(backTextbox).toBeVisible({ timeout: 10_000 });
  await backTextbox.fill("Termination Test A");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Good" })).toBeVisible();

  // Press "Escape" to trigger termination confirmation dialog
  await page.keyboard.press("Escape");

  // Verify termination dialog offers both "Continue studying" and "Close" options
  const terminationDialog = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "Continue studying" }),
  });
  await expect(terminationDialog).toBeVisible();

  const continueButton = terminationDialog.getByRole("button", { name: "Continue studying" });
  const closeButton = terminationDialog.getByRole("button", { name: "Close", exact: true });

  await expect(continueButton).toBeVisible();
  await expect(closeButton).toBeVisible();

  // Click "Continue studying" — should dismiss dialog and resume lesson
  await continueButton.click();
  await expect(terminationDialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Good" })).toBeVisible();

  // Press "Escape" again and this time choose "Close" to terminate the lesson
  await page.keyboard.press("Escape");

  const terminationDialog2 = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "Continue studying" }),
  });
  await expect(terminationDialog2).toBeVisible();
  await terminationDialog2.getByRole("button", { name: "Close", exact: true }).click();

  // Verify lesson is closed and user is redirected to dashboard
  await expect(lessonDialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
