import { expect, test } from "@playwright/test";
import { createTemplate, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("clones an existing template and verifies the copied fields", async ({ page }) => {
  const sourceTitle = "E2E Source Template";
  const clonedTitle = "E2E Cloned Template";
  const clonedFieldTitle = "Clone-only field";

  await setupDemo(page);
  await createTemplate(page, sourceTitle);

  // Modify template before cloning
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  const fieldDeleteButtons = page.getByRole("button", { name: "Delete field" });
  await expect(fieldDeleteButtons).toHaveCount(3);

  const fieldTitles = page.getByRole("textbox", { name: "Title" });
  await fieldTitles.last().clear();
  await fieldTitles.last().fill(clonedFieldTitle);
  await fieldTitles.last().blur();

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Clone the template
  const cloneTrigger = page.getByRole("button", { name: "Clone template", exact: true });
  await expect(cloneTrigger).toBeVisible();
  await cloneTrigger.click();

  const cloneDialog = page.getByRole("dialog");
  await expect(cloneDialog).toBeVisible();

  await cloneDialog.getByLabel("Title", { exact: true }).fill(clonedTitle);

  const cloneButton = cloneDialog.getByRole("button", { name: "Clone", exact: true });
  await expect(cloneButton).toBeEnabled();
  await cloneButton.click();

  // Navigate to the new template
  await expect(cloneDialog.getByRole("link", { name: "Go to the new template", exact: true })).toBeVisible();
  await cloneDialog.getByRole("link", { name: "Go to the new template", exact: true }).click();

  // Verify content
  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await expect(page.getByRole("heading", { name: clonedTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete field" })).toHaveCount(3);
  await expect(page.getByRole("textbox", { name: "Title" }).last()).toHaveValue(clonedFieldTitle);

  // Verify presence in the list of templates
  await openSection(page, "Templates");
  await expect(page.getByRole("link", { name: sourceTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: clonedTitle, exact: true })).toBeVisible();
});
