import { expect, test } from "@playwright/test";
import { openSection, setupDemo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
  });
});

test("completes a full learning workflow from deck creation to lesson grading", async ({ page }) => {
  const deckTitle = "E2E Workflow Deck";

  // Stage 1 — Set up demo
  await setupDemo(page);

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

  // Stage 3 — Add a card to the deck (ensure we're on the Cards tab)
  const cardsTab = page.getByRole("tab", { name: "Cards" });
  await expect(cardsTab).toBeVisible();
  await cardsTab.click();

  const addCardButton = page.getByRole("button", { name: "Add cards" });
  await expect(addCardButton).toBeVisible();
  await addCardButton.click();

  const addCardDialog = page.getByRole("dialog");
  await expect(addCardDialog).toBeVisible();

  // Use type() instead of fill() to properly trigger form change events
  await addCardDialog.getByRole("textbox", { name: "Front" }).click();
  await page.keyboard.type("What is 2+2?");
  await addCardDialog.getByRole("textbox", { name: "Back" }).click();
  await page.keyboard.type("4");

  await addCardDialog.getByRole("button", { name: "Create card" }).click();

  // Close the add card dialog (it stays open after submit for batch entry)
  await page.keyboard.press("Escape");
  await expect(addCardDialog).not.toBeVisible();

  // Stage 4 — Navigate to dashboard and start a lesson
  await openSection(page, "Dashboard");

  // Wait for the lesson table to load. The badge button shows "1" (one new card).
  const lessonBadge = page.getByRole("button", { name: "1" }).first();
  await expect(lessonBadge).toBeVisible({ timeout: 10_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await expect(lessonDialog.getByRole("heading", { name: "Study cards" })).toBeVisible();

  // Start the lesson
  await lessonDialog.getByRole("button", { name: "Start" }).click();

  // Stage 5 — Answer card(s). Learn-ahead may re-queue the same card,
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

  // Stage 6 — Lesson completion
  await expect(doneMessage).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();

  // Verify dialog closed and we're back on dashboard
  await expect(lessonDialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
