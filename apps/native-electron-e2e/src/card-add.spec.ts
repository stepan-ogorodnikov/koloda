import { expect, test } from "./fixtures";
import { createDeck, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("validates required field, creates a card, and resets the form", async ({ page }) => {
  await setupApp(page);
  await createDeck(page, "Test Deck");
  await page.getByRole("tab", { name: "Cards" }).click();

  await page.getByRole("button", { name: "Add cards" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Add card", exact: true })).toBeVisible();

  const frontField = dialog.getByRole("textbox", { name: "Front" });
  const backField = dialog.getByRole("textbox", { name: "Back" });
  const submitButton = dialog.getByRole("button", { name: "Create card" });

  // Validation: empty front field
  await frontField.click();
  await frontField.fill("test");
  await frontField.clear();
  await frontField.blur();

  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This field can't be empty").first()).toBeVisible();

  // Success: create card and verify form reset
  await frontField.click();
  await frontField.fill("Test Front");
  await backField.click();
  await backField.fill("Test Back");

  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(frontField).toHaveValue("");
  await expect(backField).toHaveValue("");
  await expect(submitButton).toBeDisabled();

  // Verify card is in the table
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await expect(page.getByRole("row").filter({ has: page.getByText("Test Front", { exact: true }) })).toBeVisible();
  await expect(page.getByRole("row").filter({ has: page.getByText("Test Back", { exact: true }) })).toBeVisible();
});
