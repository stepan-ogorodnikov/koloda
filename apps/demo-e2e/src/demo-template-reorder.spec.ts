import { expect, type Page, test } from "@playwright/test";
import { createTemplate, dragTo, openSection, reorderWithKeyboard, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

function getFieldsSection(page: Page) {
  return page.getByText("Fields", { exact: true }).locator("..");
}

function getLayoutSection(page: Page) {
  return page.getByText("Layout", { exact: true }).locator("..");
}

test("reorders fields via drag-and-drop and verifies persistence", async ({ page }) => {
  const templateTitle = "E2E Reorder Fields";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Default: Front (0), Back (1)
  const fieldsSection = getFieldsSection(page);
  const fieldTitles = fieldsSection.getByRole("textbox", { name: "Title" });
  const deleteButtons = fieldsSection.getByRole("button", { name: "Delete field" });
  await expect(deleteButtons).toHaveCount(2);
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("Back");

  // Drag field 1 (Back) to position 0 (Front)
  const dragHandles = fieldsSection.getByRole("button", { name: "Drag handle" });
  await dragTo(page, dragHandles.nth(1), dragHandles.nth(0));

  // Verify fields reordered: Back (0), Front (1)
  await expect(fieldTitles.nth(0)).toHaveValue("Back");
  await expect(fieldTitles.nth(1)).toHaveValue("Front");

  // Save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify persistence
  const persistedTitles = getFieldsSection(page).getByRole("textbox", { name: "Title" });
  await expect(persistedTitles.nth(0)).toHaveValue("Back");
  await expect(persistedTitles.nth(1)).toHaveValue("Front");
});

test("reorders layout items via drag-and-drop and verifies persistence", async ({ page }) => {
  const templateTitle = "E2E Reorder Layout";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Default layout: Front (0), Back (1)
  const layoutSection = getLayoutSection(page);
  const layoutFields = layoutSection.getByRole("textbox", { name: "Field" });
  await expect(layoutFields).toHaveCount(2);
  await expect(layoutFields.nth(0)).toHaveValue("Front");
  await expect(layoutFields.nth(1)).toHaveValue("Back");

  // Drag layout item 1 (Back) to position 0 (Front)
  const layoutDragHandles = layoutSection.getByRole("button", { name: "Drag handle" });
  await dragTo(page, layoutDragHandles.nth(1), layoutDragHandles.nth(0));

  // Verify layout reordered: Back (0), Front (1)
  await expect(layoutFields.nth(0)).toHaveValue("Back");
  await expect(layoutFields.nth(1)).toHaveValue("Front");

  // Verify fields section is unchanged: Front (0), Back (1)
  const fieldTitles = getFieldsSection(page).getByRole("textbox", { name: "Title" });
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("Back");

  // Save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify layout persistence
  const persistedLayoutFields = getLayoutSection(page).getByRole("textbox", { name: "Field" });
  await expect(persistedLayoutFields.nth(0)).toHaveValue("Back");
  await expect(persistedLayoutFields.nth(1)).toHaveValue("Front");
});

test("reorders fields after adding multiple custom fields", async ({ page }) => {
  const templateTitle = "E2E Reorder Multi";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Add fields A, B, C
  for (const name of ["A", "B", "C"]) {
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    const lastField = getFieldsSection(page).getByRole("textbox", { name: "Title" }).last();
    await lastField.clear();
    await lastField.fill(name);
    await lastField.blur();
  }

  // Now: Front (0), Back (1), A (2), B (3), C (4)
  const fieldsSection = getFieldsSection(page);
  const fieldTitles = fieldsSection.getByRole("textbox", { name: "Title" });
  await expect(fieldTitles).toHaveCount(5);
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(4)).toHaveValue("C");

  // Drag C (index 4) to index 1 (between Front and Back)
  const dragHandles = fieldsSection.getByRole("button", { name: "Drag handle" });
  await dragTo(page, dragHandles.nth(4), dragHandles.nth(1));

  // Verify: Front (0), C (1), Back (2), A (3), B (4)
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("C");
  await expect(fieldTitles.nth(2)).toHaveValue("Back");
  await expect(fieldTitles.nth(3)).toHaveValue("A");
  await expect(fieldTitles.nth(4)).toHaveValue("B");

  // Save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify persistence
  const persistedTitles = getFieldsSection(page).getByRole("textbox", { name: "Title" });
  await expect(persistedTitles.nth(0)).toHaveValue("Front");
  await expect(persistedTitles.nth(1)).toHaveValue("C");
  await expect(persistedTitles.nth(2)).toHaveValue("Back");
  await expect(persistedTitles.nth(3)).toHaveValue("A");
  await expect(persistedTitles.nth(4)).toHaveValue("B");
});

test("reorders fields via keyboard and verifies persistence", async ({ page }) => {
  const templateTitle = "E2E Reorder Fields KB";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Default: Front (0), Back (1)
  const fieldsSection = getFieldsSection(page);
  const fieldTitles = fieldsSection.getByRole("textbox", { name: "Title" });
  const deleteButtons = fieldsSection.getByRole("button", { name: "Delete field" });
  await expect(deleteButtons).toHaveCount(2);
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("Back");

  // Keyboard reorder field 1 (Back) to position 0
  const dragHandles = fieldsSection.getByRole("button", { name: "Drag handle" });
  await reorderWithKeyboard(dragHandles.nth(1), "up", 1);

  // Verify fields reordered: Back (0), Front (1)
  await expect(fieldTitles.nth(0)).toHaveValue("Back");
  await expect(fieldTitles.nth(1)).toHaveValue("Front");

  // Save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify persistence
  const persistedTitles = getFieldsSection(page).getByRole("textbox", { name: "Title" });
  await expect(persistedTitles.nth(0)).toHaveValue("Back");
  await expect(persistedTitles.nth(1)).toHaveValue("Front");
});

test("reorders layout items via keyboard and verifies persistence", async ({ page }) => {
  const templateTitle = "E2E Reorder Layout KB";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Default layout: Front (0), Back (1)
  const layoutSection = getLayoutSection(page);
  const layoutFields = layoutSection.getByRole("textbox", { name: "Field" });
  await expect(layoutFields).toHaveCount(2);
  await expect(layoutFields.nth(0)).toHaveValue("Front");
  await expect(layoutFields.nth(1)).toHaveValue("Back");

  // Keyboard reorder layout item 1 (Back) to position 0
  const layoutDragHandles = layoutSection.getByRole("button", { name: "Drag handle" });
  await reorderWithKeyboard(layoutDragHandles.nth(1), "up", 1);

  // Verify layout reordered: Back (0), Front (1)
  await expect(layoutFields.nth(0)).toHaveValue("Back");
  await expect(layoutFields.nth(1)).toHaveValue("Front");

  // Verify fields section is unchanged: Front (0), Back (1)
  const fieldTitles = getFieldsSection(page).getByRole("textbox", { name: "Title" });
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("Back");

  // Save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify layout persistence
  const persistedLayoutFields = getLayoutSection(page).getByRole("textbox", { name: "Field" });
  await expect(persistedLayoutFields.nth(0)).toHaveValue("Back");
  await expect(persistedLayoutFields.nth(1)).toHaveValue("Front");
});

test("reorders fields via keyboard after adding multiple custom fields", async ({ page }) => {
  const templateTitle = "E2E Reorder Multi KB";

  await setupDemo(page);
  await createTemplate(page, templateTitle);

  // Add fields A, B, C
  for (const name of ["A", "B", "C"]) {
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    const lastField = getFieldsSection(page).getByRole("textbox", { name: "Title" }).last();
    await lastField.clear();
    await lastField.fill(name);
    await lastField.blur();
  }

  // Now: Front (0), Back (1), A (2), B (3), C (4)
  const fieldsSection = getFieldsSection(page);
  const fieldTitles = fieldsSection.getByRole("textbox", { name: "Title" });
  await expect(fieldTitles).toHaveCount(5);
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(4)).toHaveValue("C");

  // Keyboard reorder C (index 4) to index 1 (3 steps up)
  const dragHandles = fieldsSection.getByRole("button", { name: "Drag handle" });
  await reorderWithKeyboard(dragHandles.nth(4), "up", 3);

  // Verify: Front (0), C (1), Back (2), A (3), B (4)
  await expect(fieldTitles.nth(0)).toHaveValue("Front");
  await expect(fieldTitles.nth(1)).toHaveValue("C");
  await expect(fieldTitles.nth(2)).toHaveValue("Back");
  await expect(fieldTitles.nth(3)).toHaveValue("A");
  await expect(fieldTitles.nth(4)).toHaveValue("B");

  // Save
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Templates");
  await page.getByRole("link", { name: templateTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/\d+$/);

  // Verify persistence
  const persistedTitles = getFieldsSection(page).getByRole("textbox", { name: "Title" });
  await expect(persistedTitles.nth(0)).toHaveValue("Front");
  await expect(persistedTitles.nth(1)).toHaveValue("C");
  await expect(persistedTitles.nth(2)).toHaveValue("Back");
  await expect(persistedTitles.nth(3)).toHaveValue("A");
  await expect(persistedTitles.nth(4)).toHaveValue("B");
});
