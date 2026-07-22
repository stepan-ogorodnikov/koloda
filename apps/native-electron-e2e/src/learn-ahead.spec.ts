import { expect, type Page, test } from "./fixtures";
import {
  createDeckWithCard,
  openSection,
  setLearnAheadLimit,
  setupApp,
  setupPageDefaults,
  startDeckLesson,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function gradeCard(page: Page, grade: string) {
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  await backTextbox.fill("answer");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: grade }).click();
}

test("learn-ahead re-queues a card when its next due is within the limit", async ({ page }) => {
  const deckTitle = "Learn Ahead E2E Deck";

  await setupApp(page);
  await createDeckWithCard(page, deckTitle, "Capital of France", "Paris");
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);

  // Grade the single card as "Again".
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

  // Verify lesson completes
  await expect(doneMessage).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Verify the card is no longer in "New" state
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();

  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(0);
});

test("learn-ahead 0 does not re-queue a card after grading", async ({ page }) => {
  const deckTitle = "No Learn Ahead E2E Deck";

  await setupApp(page);
  await setLearnAheadLimit(page, 0, 0);
  await createDeckWithCard(page, deckTitle, "Capital of Germany", "Berlin");
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);

  // Grade the single card as "Again" (or any grade).
  // With learn-ahead at 0, the card should NOT be re-queued
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

  await gradeCard(page, "Again");

  // The "Done" screen should appear immediately — no re-queue
  await expect(doneMessage).toBeVisible({ timeout: 10_000 });

  // Close the lesson
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Verify the card moved out of "New" state
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();

  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await cardsTab.click();

  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(0);
});
