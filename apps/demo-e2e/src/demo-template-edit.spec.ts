import { expect, type Page, test } from "@playwright/test";
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
