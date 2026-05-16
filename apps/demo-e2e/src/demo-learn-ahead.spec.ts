import { expect, test, type Page } from "@playwright/test";
import { openSection, setLearnAheadLimit, setupDemo, startDeckLesson } from "./helpers";

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

async function gradeCard(page: Page, grade: string) {
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  await backTextbox.fill("answer");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: grade }).click();
}

async function createDeckWithCard(page: Page, deckTitle: string, cardFront: string, cardBack: string) {
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

  await addCard(page, cardFront, cardBack);

  return cardsTab;
}

test("learn-ahead re-queues a card when its next due is within the limit", async ({ page }) => {
  const deckTitle = "Learn Ahead E2E Deck";

  // Stage 1 — Set up demo (default learn-ahead is 30 min, no need to change it)
  await setupDemo(page);

  // Stage 2 — Create a deck with one card
  const cardsTab = await createDeckWithCard(page, deckTitle, "Capital of France", "Paris");

  // Stage 3 — Start a lesson
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);

  // Stage 4 — Grade the single card as "Again".
  // With default learn-ahead (30 min), FSRS reschedules the card to be due very soon,
  // which falls within the window. The card should be re-queued and appear again.
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

  // Grade "Again" — card should be re-queued due to learn-ahead
  await gradeCard(page, "Again");

  // The card re-appears because learn-ahead pushed it back into the queue.
  // Verify we see the card again (not the "Done" screen).
  await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });
  await expect(doneMessage).not.toBeVisible();
  await expect(backTextbox).toBeVisible();

  // Grade "Good" — still within learning steps, may still re-queue
  await gradeCard(page, "Good");

  // Continue grading until the lesson completes
  for (let i = 0; i < 8; i++) {
    await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

    if (await doneMessage.isVisible().catch(() => false)) break;

    await gradeCard(page, "Good");
  }

  // Stage 5 — Verify lesson completes
  await expect(doneMessage).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Stage 6 — Verify the card is no longer in "New" state
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await cardsTab.click();

  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(0);
});

test("learn-ahead 0 does not re-queue a card after grading", async ({ page }) => {
  const deckTitle = "No Learn Ahead E2E Deck";

  // Stage 1 — Set up demo and set learn-ahead to 0
  await setupDemo(page);
  await setLearnAheadLimit(page, 0, 0);

  // Stage 2 — Create a deck with one card
  await createDeckWithCard(page, deckTitle, "Capital of Germany", "Berlin");

  // Stage 3 — Start a lesson
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);

  // Stage 4 — Grade the single card as "Again" (or any grade).
  // With learn-ahead at 0, the card should NOT be re-queued — it appears exactly once.
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

  await gradeCard(page, "Again");

  // The "Done" screen should appear immediately — no re-queue
  await expect(doneMessage).toBeVisible({ timeout: 10_000 });

  // Stage 5 — Close the lesson
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Stage 6 — Verify the card moved out of "New" state
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();

  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await cardsTab.click();

  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(0);
});