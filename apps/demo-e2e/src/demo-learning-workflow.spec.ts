import { expect, test } from "@playwright/test";
import { addCard, createDeck, setupDemo, setupPageDefaults, startDeckLesson } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("completes a full learning workflow from deck creation to lesson grading", async ({ page }) => {
  const deckTitle = "E2E Workflow Deck";

  await setupDemo(page);
  await createDeck(page, deckTitle);

  // Add a card to the deck (ensure we're on the "Cards" tab)
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, "What is 2+2?", "4");

  // Navigate to dashboard and start a lesson
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);

  // Answer card(s). Learn-ahead may re-queue the same card,
  // so loop until the "Done" completion screen appears.
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  for (let i = 0; i < 10; i++) {
    // After grading, either the next card or the "Done" completion appears.
    // Wait for whichever shows up first.
    await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

    if (await doneMessage.isVisible().catch(() => false)) break;

    const continueButton = page.getByRole("button", { name: "Continue" });
    const goodButton = page.getByRole("button", { name: /Good/ });

    await backTextbox.fill("4");
    await continueButton.click();
    await goodButton.click();
  }

  // Lesson completion
  await expect(doneMessage).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();

  // Verify dialog closed and we're back on dashboard
  await expect(lessonDialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
