import { expect, test } from "@playwright/test";
import { addCard, createDeck, createTemplate, openSection } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("locks template when card is added and unlocks when card is deleted", async ({ page }) => {
  test.setTimeout(90_000);

  const deckTitle = "Template Lock Deck";
  const templateTitle = "Lock Test Template";
  const cardFront = "Lock Test Card";
  const templateNotes = "Notes on a locked template";
  const cloneTitle = "Lock Test Clone";

  await setupWeb(page);
  await createTemplate(page, templateTitle);
  await createDeck(page, deckTitle);

  // Assign template to deck
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: /Template$/ }).click();
  await page.getByRole("option", { name: templateTitle, exact: true }).click();
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  // Wait for the mutation to complete (Save button disappears via form reset)
  await expect(saveButton).not.toBeVisible();

  // Ensure template isn't locked
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(
    /\/templates\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );
  await expect(page.getByText("Not locked", { exact: true })).toBeVisible();

  // Add card
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/decks\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  await page.getByRole("tab", { name: "Cards" }).click();
  await addCard(page, cardFront, "answer");

  // Ensure template gets locked
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(
    /\/templates\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  // Locked: field types, required flags, the field list, and delete are closed
  await expect(page.getByRole("button", { name: /Field 1 type$/ })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Field 1 required" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add field", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete field" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete template", exact: true })).toBeDisabled();

  // Locked: operations and notes still save
  await page.getByRole("button", { name: /Layout item 2 operation$/ }).click();
  await page.getByRole("option", { name: "Reveal", exact: true }).click();
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill(templateNotes);
  const templateSaveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await templateSaveButton.click();
  await expect(templateSaveButton).not.toBeVisible();

  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(templateNotes);
  await expect(page.getByRole("button", { name: /Layout item 2 operation$/ })).toContainText("Reveal");

  // Clone the locked template: the clone starts unlocked, with the same fields and no notes
  await page.getByRole("button", { name: "Clone template", exact: true }).click();
  const cloneDialog = page.getByRole("dialog");
  await cloneDialog.getByLabel("Title", { exact: true }).fill(cloneTitle);
  await cloneDialog.getByRole("button", { name: "Clone", exact: true }).click();
  await cloneDialog.getByRole("link", { name: "Go to the new template", exact: true }).click();
  await expect(page.getByRole("heading", { name: cloneTitle, exact: true })).toBeVisible();
  await expect(page.getByText("Not locked", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Field \d+ title$/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Layout item 2 operation$/ })).toContainText("Reveal");
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("");

  // Delete card
  await openSection(page, "Decks");
  await page.getByRole("link", { name: deckTitle, exact: true }).click();
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.getByRole("button", { name: "Delete card" }).first().click();

  const deletePopover = page.getByRole("dialog");
  await expect(deletePopover).toBeVisible();
  await deletePopover.getByRole("button", { name: "Delete", exact: true }).click();
  // The popover closes in the delete's success handler, which also refreshes the template.
  await expect(deletePopover).not.toBeVisible();

  // Ensure template gets unlocked again
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(
    /\/templates\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );
  await expect(page.getByText("Not locked", { exact: true })).toBeVisible();
});
