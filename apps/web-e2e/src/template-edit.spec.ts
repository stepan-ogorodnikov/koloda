import { expect, test } from "@playwright/test";
import { createTemplate, openSection } from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("edits template title, adds and removes fields, and verifies persistence", async ({ page }) => {
  const templateTitle = "E2E Edit Template";
  const updatedTitle = "E2E Updated Template";
  const newFieldTitle = "Extra Field";

  await setupWeb(page);
  await createTemplate(page, templateTitle);

  // Wait for default template fields (Front + Back)
  const fieldDeleteButtons = page.getByRole("button", { name: "Delete field" });
  await expect(fieldDeleteButtons).toHaveCount(2);
  const initialFieldCount = 2;

  // Change the template title
  const templateTitleField = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(templateTitleField).toBeVisible();
  await templateTitleField.clear();
  await templateTitleField.fill(updatedTitle);
  await templateTitleField.blur();

  // Add a new field; it gets a layout item that displays it
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await expect(fieldDeleteButtons).toHaveCount(initialFieldCount + 1);
  await expect(page.getByRole("button", { name: /Layout item 3 operation$/ })).toContainText("Display");

  // Fill the new field's title (the last field title is the new field)
  const fieldTitles = page.getByRole("textbox", { name: /^Field \d+ title$/ });
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
  await expect(page).toHaveURL(
    /\/templates\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

  // Verify title persisted
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);

  // Verify field count and new field title persisted
  const persistedFieldTitles = page.getByRole("textbox", { name: /^Field \d+ title$/ });
  const persistedDeleteButtons = page.getByRole("button", { name: "Delete field" });
  await expect(persistedDeleteButtons).toHaveCount(initialFieldCount);
  await expect(persistedFieldTitles.last()).toHaveValue(newFieldTitle);

  // The last field cannot be removed
  await persistedDeleteButtons.first().click();
  await expect(persistedFieldTitles).toHaveCount(1);
  await expect(persistedDeleteButtons).toHaveCount(0);
});
