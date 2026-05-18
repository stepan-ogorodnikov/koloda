import { expect, test } from "@playwright/test";
import { createDeckWithTemplate, createTemplate, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("deletes a template with no decks and redirects to /templates", async ({ page }) => {
  const templateTitle = "E2E Delete Template";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Open the delete dialog
  const deleteTrigger = page.getByRole("button", { name: "Delete template", exact: true });
  await expect(deleteTrigger).toBeVisible();
  await deleteTrigger.click();

  // Confirm deletion
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("Are you sure you want to delete this template?")).toBeVisible();

  await deleteDialog.getByRole("button", { name: "Delete template", exact: true }).click();

  // Verify redirect to /templates
  await expect(page).toHaveURL(/\/templates$/);

  // Verify the template no longer appears in the list
  await expect(page.getByRole("link", { name: templateTitle, exact: true })).not.toBeVisible();
});

test("prevents deleting a default template", async ({ page }) => {
  await setupDemo(page);

  // Navigate to the default template
  await openSection(page, "Templates");
  await page.getByRole("link", { name: "Default", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify delete trigger is disabled
  const deleteTrigger = page.getByRole("button", { name: "Delete template", exact: true });
  await expect(deleteTrigger).toBeDisabled();
});

test("prevents deleting a template that is in use by a deck", async ({ page }) => {
  const templateTitle = "E2E In-Use Template";
  const deckTitle = "E2E Guard Deck";

  await setupDemo(page);
  await createTemplate(page, templateTitle);
  await createDeckWithTemplate(page, deckTitle, templateTitle);

  // Navigate back to the template
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify delete trigger is disabled
  const deleteTrigger = page.getByRole("button", { name: "Delete template", exact: true });
  await expect(deleteTrigger).toBeDisabled();
});
