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

async function createAlgorithm(page: Page, title: string) {
  await openSection(page, "Presets");

  await page.getByRole("button", { name: "New preset", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).fill(title);

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new preset", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/algorithms\/\d+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

test("creates an algorithm, modifies parameters, and verifies persistence", async ({ page }) => {
  const algorithmTitle = "E2E Algorithm";
  const updatedTitle = "E2E Algorithm Updated";

  await setupDemo(page);
  await createAlgorithm(page, algorithmTitle);

  // Modify parameters
  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(titleField).toBeVisible();
  await titleField.clear();
  await titleField.fill(updatedTitle);
  await titleField.blur();

  // Change retention
  const retentionField = page.getByRole("textbox", { name: "Retention" });
  await retentionField.click();
  await retentionField.fill("85");
  await retentionField.blur();

  // Save changes
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).not.toBeVisible();

  // Verify persistence after navigation
  await openSection(page, "Dashboard");
  await openSection(page, "Presets");
  await page.getByRole("link", { name: updatedTitle, exact: true }).click();
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);

  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(updatedTitle);
  await expect(page.getByRole("textbox", { name: "Retention" })).toHaveValue("85");
});
