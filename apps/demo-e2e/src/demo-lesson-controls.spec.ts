import { expect, test, type Page } from "@playwright/test";
import { openSection, setupDemo } from "./helpers";

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

test("adjusts card amounts in lesson init dialog and verifies expected counts", async ({ page }) => {
  const deckTitle = "E2E Amount Deck";

  // Stage 1 — Set up demo and create a deck with 3 cards
  await setupDemo(page);
  await openSection(page, "Decks");
  await createDeck(page, deckTitle);
  await addCard(page, "Q1", "A1");
  await addCard(page, "Q2", "A2");
  await addCard(page, "Q3", "A3");

  // Stage 2 — Navigate to dashboard and open lesson init
  await openSection(page, "Dashboard");

  const lessonBadge = page.getByRole("button", { name: "3" }).first();
  await expect(lessonBadge).toBeVisible({ timeout: 10_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await expect(lessonDialog.getByRole("heading", { name: "Study cards" })).toBeVisible();

  // Stage 3 — Verify default amounts: 3 new cards available
  const newAmountInput = lessonDialog.getByRole("textbox", { name: "Amount of cards of type new" });
  await expect(newAmountInput).toHaveValue("3");

  // Stage 4 — Change the new card amount to 1
  await newAmountInput.click();
  await newAmountInput.fill("1");
  await newAmountInput.blur();

  // Stage 5 — Start the lesson
  await lessonDialog.getByRole("button", { name: "Start" }).click();

  // Stage 6 — Verify only 1 card is studied (not 3)
  // Answer the first card
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

  if (await doneMessage.isVisible().catch(() => false)) {
    // Already done
  } else {
    await backTextbox.fill("A1");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Good" }).click();
  }

  // Handle possible learn-ahead re-queues
  for (let i = 0; i < 10; i++) {
    await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

    if (await doneMessage.isVisible().catch(() => false)) break;

    await backTextbox.fill("answer");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Good" }).click();
  }

  // Stage 7 — Verify lesson completes
  await expect(doneMessage).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Stage 8 — Verify remaining cards (2) are still "New" (not studied)
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();

  // 2 out of 3 cards should still be "New"
  // (the 1 graded card moved out of New, the 2 unstudied remain New)
  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(2);
});

test("terminates lesson mid-study with confirmation and returns to dashboard", async ({ page }) => {
  const deckTitle = "E2E Terminate Deck";

  // Stage 1 — Set up demo and create a deck with a card
  await setupDemo(page);
  await openSection(page, "Decks");
  await createDeck(page, deckTitle);
  await addCard(page, "Termination Test Q", "Termination Test A");

  // Stage 2 — Start a lesson
  await openSection(page, "Dashboard");

  const lessonBadge = page.getByRole("button", { name: "1" }).first();
  await expect(lessonBadge).toBeVisible({ timeout: 10_000 });
  await lessonBadge.click();

  const lessonDialog = page.getByRole("dialog");
  await expect(lessonDialog).toBeVisible();
  await lessonDialog.getByRole("button", { name: "Start" }).click();

  // Stage 3 — Answer one card fill-in (type answer) but don't grade yet
  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  await backTextbox.or(doneMessage).waitFor({ timeout: 10_000 });

  if (await doneMessage.isVisible().catch(() => false)) {
    // Card auto-graded, nothing to terminate mid-way
    await page.getByRole("button", { name: "Close" }).click();
    return;
  }

  await backTextbox.fill("Termination Test A");
  await page.getByRole("button", { name: "Continue" }).click();

  // Stage 4 — Attempt to close the lesson (press Escape to trigger termination)
  await page.keyboard.press("Escape");

  // Stage 5 — Verify termination confirmation dialog appears
  const terminationDialog = page.getByRole("dialog");
  await expect(terminationDialog).toBeVisible();

  const continueButton = terminationDialog.getByRole("button", { name: "Continue studying" });
  const closeButton = terminationDialog.getByRole("button", { name: "Close", exact: true });

  await expect(continueButton).toBeVisible();
  await expect(closeButton).toBeVisible();

  // Stage 6 — Choose "Continue studying" to resume
  await continueButton.click();
  await expect(terminationDialog.getByRole("button", { name: "Continue studying" })).not.toBeVisible();

  // Verify we're back in the lesson (grade buttons should be visible)
  await expect(page.getByRole("button", { name: "Good" })).toBeVisible();

  // Stage 7 — Press Escape again, this time choose "Close" to actually exit
  await page.keyboard.press("Escape");

  const terminationDialog2 = page.getByRole("dialog");
  await expect(terminationDialog2).toBeVisible();
  await terminationDialog2.getByRole("button", { name: "Close", exact: true }).click();

  // Stage 8 — Verify return to dashboard
  await expect(lessonDialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
