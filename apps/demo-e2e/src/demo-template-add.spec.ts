import { expect, test } from "@playwright/test";
import { openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("rejects empty template title", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Templates");

  await page.getByRole("button", { name: "New template", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const titleField = dialog.getByLabel("Title", { exact: true });
  await titleField.click();
  await titleField.clear();
  await titleField.blur();

  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "New template", exact: true })).toBeVisible();
});

test("adds a template", async ({ page }) => {
  await setupDemo(page);
  await openSection(page, "Templates");
  await page.getByRole("button", { name: "New template", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "New template", exact: true })).toBeVisible();

  await dialog.getByLabel("Title", { exact: true }).fill("My Test Template");

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new template", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await expect(page.getByRole("heading", { name: "My Test Template", exact: true })).toBeVisible();
});
