import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { test } from "./fixtures";
import { createDeckWithCards, openLessonDialog, openSection, setLearnAheadLimit } from "@koloda/e2e";
import { setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

async function startLesson(page: Page, deckTitle: string, newCardCount: number) {
  const lessonDialog = await openLessonDialog(page, deckTitle, newCardCount);
  await lessonDialog.getByRole("button", { name: "Start" }).click();
  return lessonDialog;
}

test("adjusts card amounts in lesson init dialog and verifies expected counts", async ({ page }) => {
  const deckTitle = "E2E Amount Deck";

  await setupApp(page);
  await setLearnAheadLimit(page, 0, 0);
  await createDeckWithCards(page, deckTitle, [
    { front: "Q1", back: "A1" },
    { front: "Q2", back: "A2" },
    { front: "Q3", back: "A3" },
  ]);

  // Open lesson init dialog and verify default count is 3
  const lessonDialog = await openLessonDialog(page, deckTitle, 3);

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

  await setupApp(page);
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

// LESSONS.md (§Hotkeys, §Submitting a Card, §Early Termination) with the default bindings.
test("drives a lesson by keyboard: Space submits, a grade key grades, and Close popover closes", async ({ page }) => {
  const deckTitle = "E2E Keyboard Deck";

  await setupApp(page);
  await setLearnAheadLimit(page, 0, 0);
  await createDeckWithCards(page, deckTitle, [
    { front: "Keyboard Q1", back: "Keyboard A1" },
    { front: "Keyboard Q2", back: "Keyboard A2" },
  ]);
  const lessonDialog = await startLesson(page, deckTitle, 2);
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  const goodButton = page.getByRole("button", { name: "Good" });

  // WHY: the lesson is a modal, which refocuses a blurred field on the next frame. Focusing the dialog keeps
  // focus off the field, so single-key hotkeys reach the lesson.
  await expect(backTextbox).toBeVisible({ timeout: 10_000 });
  await expect(lessonDialog.getByText("Keyboard Q1")).toBeVisible();
  await lessonDialog.focus();

  // A grade key before submit leaves the card unanswered
  await page.keyboard.press("3");
  await expect(continueButton).toBeVisible();
  await expect(goodButton).not.toBeVisible();

  // Space submits, and the "Good" key grades on release
  await page.keyboard.press("Space");
  await expect(goodButton).toBeVisible();
  await page.keyboard.press("3");
  await expect(lessonDialog.getByText("Keyboard Q2")).toBeVisible();

  // A grade key behind the close confirmation leaves the card as it was
  await expect(backTextbox).toBeVisible();
  await lessonDialog.focus();
  await page.keyboard.press("Space");
  await expect(goodButton).toBeVisible();
  await page.keyboard.press("Escape");
  const terminationDialog = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "Continue studying" }),
  });
  await expect(terminationDialog).toBeVisible();
  await page.keyboard.press("3");
  await terminationDialog.getByRole("button", { name: "Continue studying" }).click();
  await expect(terminationDialog).not.toBeVisible();
  await expect(lessonDialog.getByText("Keyboard Q2")).toBeVisible();
  await expect(goodButton).toBeVisible();

  // Grade the last card by key, then close the finished lesson with "Close popover"
  await page.keyboard.press("3");
  await expect(lessonDialog.getByText("Done")).toBeVisible();
  await page.keyboard.press("Alt+C");
  await expect(lessonDialog).not.toBeVisible();
});
