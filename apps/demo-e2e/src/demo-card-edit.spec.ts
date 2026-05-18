import { expect, type Page, test } from "@playwright/test";
import { openSection, setLearnAheadLimit, setupDemo, startDeckLesson } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
    window.localStorage.setItem("motion", "off");
  });
});

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

  await page.getByRole("button", { name: "Add cards" }).click();

  const addCardDialog = page.getByRole("dialog");
  await expect(addCardDialog).toBeVisible();

  await addCardDialog.getByRole("textbox", { name: "Front" }).click();
  await page.keyboard.type(cardFront);
  await addCardDialog.getByRole("textbox", { name: "Back" }).click();
  await page.keyboard.type(cardBack);

  await addCardDialog.getByRole("button", { name: "Create card" }).click();
  await expect(addCardDialog.getByRole("textbox", { name: "Front" })).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(addCardDialog).not.toBeVisible();
}

test("edits card content fields and verifies changes persist", async ({ page }) => {
  const deckTitle = "E2E Edit Card Deck";
  const originalFront = "Original Front";
  const originalBack = "Original Back";
  const updatedFront = "Updated Front Content";
  const updatedBack = "Updated Back Content";

  await setupDemo(page);
  await createDeckWithCard(page, deckTitle, originalFront, originalBack);

  // Open card edit dialog
  await page.getByRole("button", { name: "Edit card" }).click();

  const editDialog = page.getByRole("dialog");
  await expect(editDialog).toBeVisible();

  // Verify current field values and update them
  const frontField = editDialog.getByRole("textbox", { name: "Front" });
  const backField = editDialog.getByRole("textbox", { name: "Back" });

  await expect(frontField).toHaveValue(originalFront);
  await expect(backField).toHaveValue(originalBack);

  await frontField.click();
  await frontField.clear();
  await page.keyboard.type(updatedFront);

  await backField.click();
  await backField.clear();
  await page.keyboard.type(updatedBack);

  // Save changes
  await editDialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(editDialog).not.toBeVisible();

  // Verify changes persist after navigation
  await openSection(page, "Dashboard");
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();

  await page.getByRole("button", { name: "Edit card" }).click();

  const reopenedDialog = page.getByRole("dialog");
  await expect(reopenedDialog).toBeVisible();
  await expect(reopenedDialog.getByRole("textbox", { name: "Front" })).toHaveValue(updatedFront);
  await expect(reopenedDialog.getByRole("textbox", { name: "Back" })).toHaveValue(updatedBack);
});

test("opens card preview and verifies content in lesson-like format", async ({ page }) => {
  const deckTitle = "E2E Preview Deck";
  const cardFront = "Preview Front Content";
  const cardBack = "Preview Back Content";

  await setupDemo(page);
  await createDeckWithCard(page, deckTitle, cardFront, cardBack);

  // Open card preview
  await page.getByRole("button", { name: "Preview Card" }).click();
  const previewDialog = page.getByRole("dialog");
  await expect(previewDialog).toBeVisible();

  // Verify "Front" is visible in the preview
  await expect(previewDialog.getByText(cardFront)).toBeVisible();

  // Reveal the answer
  await previewDialog.getByRole("button", { name: "Continue" }).click();

  // Verify "Back" is now visible
  await expect(previewDialog.getByText(cardBack)).toBeVisible();

  // Close the preview
  await page.keyboard.press("Escape");
  await expect(previewDialog).not.toBeVisible();
});

test("resets card progress and verifies card returns to New state", async ({ page }) => {
  const deckTitle = "E2E Reset Card Deck";
  const cardFront = "Reset Card Content";
  const cardBack = "Answer";

  await setupDemo(page);
  await setLearnAheadLimit(page, 0, 0);
  await createDeckWithCard(page, deckTitle, cardFront, cardBack);

  // Grade the card to move it out of "New" state
  const lessonDialog = await startDeckLesson(page, deckTitle, 1);

  const backTextbox = page.getByRole("textbox", { name: "Back" });
  const doneMessage = lessonDialog.getByText("Done");

  await expect(backTextbox).toBeVisible({ timeout: 10_000 });
  await backTextbox.fill(cardBack);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(doneMessage).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(lessonDialog).not.toBeVisible();

  // Navigate to the deck and open the card edit dialog
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();

  // The card should no longer be "New"
  const newBadges = page.getByRole("row").locator("text=New");
  await expect(newBadges).toHaveCount(0);

  // Open card edit and reset progress
  await page.getByRole("button", { name: "Edit card" }).click();

  const editDialog = page.getByRole("dialog");
  await expect(editDialog).toBeVisible();

  const resetButton = editDialog.getByRole("button", { name: "Reset progress" });
  await expect(resetButton).toBeVisible();
  await resetButton.click();
  await expect(resetButton).not.toBeVisible();

  // Close dialog and verify card is "New" again
  await page.keyboard.press("Escape");
  await expect(editDialog).not.toBeVisible();

  // The card should now show "New" state
  await expect(page.getByRole("row").locator("text=New")).toHaveCount(1);
});
