import { expect, test } from "@playwright/test";
import { createTemplate, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("edits template title, adds and removes fields, and verifies persistence", async ({ page }) => {
  const templateTitle = "E2E Edit Template";
  const updatedTitle = "E2E Updated Template";
  const newFieldTitle = "Extra Field";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Wait for default template fields (Front + Back)
  const fieldDeleteButtons = page.getByRole("button", { name: "Delete field" });
  await expect(fieldDeleteButtons).toHaveCount(2);
  const initialFieldCount = 2;

  // Change the template title
  const templateTitleField = page.getByRole("textbox", { name: "Title", exact: true }).first();
  await expect(templateTitleField).toBeVisible();
  await templateTitleField.clear();
  await templateTitleField.fill(updatedTitle);
  await templateTitleField.blur();

  // Add a new field
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await expect(fieldDeleteButtons).toHaveCount(initialFieldCount + 1);

  // Fill the new field's title (the last "Title" textbox is the new field)
  const fieldTitles = page.getByRole("textbox", { name: "Title" });
  const newFieldInput = fieldTitles.last();
  await newFieldInput.clear();
  await newFieldInput.fill(newFieldTitle);
  await newFieldInput.blur();

  // Remove the first field
  await fieldDeleteButtons.first().click();
  await expect(fieldDeleteButtons).toHaveCount(initialFieldCount);

  // Save and verify persistence via navigation
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: updatedTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify title persisted
  await expect(page.getByRole("textbox", { name: "Title", exact: true }).first()).toHaveValue(updatedTitle);

  // Verify field count and new field title persisted
  const persistedFieldTitles = page.getByRole("textbox", { name: "Title" });
  const persistedDeleteButtons = page.getByRole("button", { name: "Delete field" });
  await expect(persistedDeleteButtons).toHaveCount(initialFieldCount);
  await expect(persistedFieldTitles.last()).toHaveValue(newFieldTitle);
});
