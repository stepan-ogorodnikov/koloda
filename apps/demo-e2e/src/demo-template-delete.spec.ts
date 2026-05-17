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

async function createTemplate(page: Page, title: string) {
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new template", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

async function createDeckWithTemplate(page: Page, title: string, templateTitle: string) {
  await openSection(page, "Decks");
  await page.getByRole("button", { name: "New deck", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  // Select the specified template
  await dialog.getByRole("button", { name: /Template$/ }).click();
  const option = page.getByRole("option", { name: templateTitle, exact: true });
  await expect(option).toBeVisible();
  await option.click();

  const createButton = dialog.getByRole("button", { name: "Add deck", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new deck", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/decks\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

test("deletes a template with no decks and redirects to /templates", async ({ page }) => {
  const templateTitle = "E2E Delete Template";

  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Create a template with no decks
  await createTemplate(page, templateTitle);

  // Stage 3 — Open the delete dialog
  const deleteTrigger = page.getByRole("button", { name: "Delete template", exact: true });
  await expect(deleteTrigger).toBeVisible();
  await deleteTrigger.click();

  // Stage 4 — Confirm deletion
  const deleteDialog = page.getByRole("dialog");
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByText("Are you sure you want to delete this template?")).toBeVisible();

  await deleteDialog.getByRole("button", { name: "Delete template", exact: true }).click();

  // Stage 5 — Verify redirect to /templates
  await expect(page).toHaveURL(/\/templates$/);

  // Stage 6 — Verify the template no longer appears in the list
  await expect(page.getByRole("link", { name: templateTitle, exact: true })).not.toBeVisible();
});

test("prevents deleting a default template", async ({ page }) => {
  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Navigate to the default template
  await openSection(page, "Templates");
  await page.getByRole("link", { name: "Default", exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Stage 3 — Verify delete trigger is disabled
  const deleteTrigger = page.getByRole("button", { name: "Delete template", exact: true });
  await expect(deleteTrigger).toBeDisabled();
});

test("prevents deleting a template that is in use by a deck", async ({ page }) => {
  const templateTitle = "E2E In-Use Template";
  const deckTitle = "E2E Guard Deck";

  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Create a template
  await createTemplate(page, templateTitle);

  // Stage 3 — Create a deck using that template
  await createDeckWithTemplate(page, deckTitle, templateTitle);

  // Stage 4 — Navigate back to the template
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Stage 5 — Verify delete trigger is disabled
  const deleteTrigger = page.getByRole("button", { name: "Delete template", exact: true });
  await expect(deleteTrigger).toBeDisabled();
});
