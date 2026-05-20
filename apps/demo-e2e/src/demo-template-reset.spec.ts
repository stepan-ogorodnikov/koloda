import { expect, type Page, test } from "@playwright/test";
import { createTemplate, dragTo, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

function getFieldsSection(page: Page) {
  return page.getByText("Fields", { exact: true }).locator("..");
}

function getLayoutSection(page: Page) {
  return page.getByText("Layout", { exact: true }).locator("..");
}

test("discards changes to template and resets form to persisted state", async ({ page }) => {
  const templateTitle = "E2E Reset Template";
  const updatedTitle = "Updated Template";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Capture initial state
  const titleField = page.locator("form").getByRole("textbox", { name: "Title", exact: true }).first();
  await expect(titleField).toHaveValue(templateTitle);
  const fieldsSection = getFieldsSection(page);
  const layoutSection = getLayoutSection(page);
  const fieldTitles = fieldsSection.getByRole("textbox", { name: "Title" });
  await expect(fieldTitles).toHaveCount(2);
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("Back");
  const layoutFields = layoutSection.getByRole("textbox", { name: "Field" });
  await expect(layoutFields).toHaveCount(2);
  await expect(layoutFields.nth(0)).toHaveValue("Front");
  await expect(layoutFields.nth(1)).toHaveValue("Back");

  // Change title
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();

  // Add a new field
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  const newField = fieldsSection.getByRole("textbox", { name: "Title" }).last();
  await newField.clear();
  await newField.fill("Extra");
  await newField.blur();

  // Reorder fields: drag Back (index 1) to position 0
  const fieldDragHandles = fieldsSection.getByRole("button", { name: "Drag handle" });
  await dragTo(page, fieldDragHandles.nth(1), fieldDragHandles.nth(0));

  // Reorder layout: drag Back (index 1) to position 0
  const layoutDragHandles = layoutSection.getByRole("button", { name: "Drag handle" });
  await dragTo(page, layoutDragHandles.nth(1), layoutDragHandles.nth(0));

  // Click "Discard" to reset the form
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  // Verify form reset to original persisted values
  await expect(titleField).toHaveValue(templateTitle);
  const resetFieldTitles = fieldsSection.getByRole("textbox", { name: "Title" });
  await expect(resetFieldTitles).toHaveCount(2);
  await expect(resetFieldTitles.nth(0)).toHaveValue("Front");
  await expect(resetFieldTitles.nth(1)).toHaveValue("Back");
  const resetLayoutFields = layoutSection.getByRole("textbox", { name: "Field" });
  await expect(resetLayoutFields).toHaveCount(2);
  await expect(resetLayoutFields.nth(0)).toHaveValue("Front");
  await expect(resetLayoutFields.nth(1)).toHaveValue("Back");
});
