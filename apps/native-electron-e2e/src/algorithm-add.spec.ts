import { expect, test } from "./fixtures";
import { openNewAlgorithmDialog, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("validates required title and adds an algorithm", async ({ page }) => {
  await setupApp(page);
  const dialog = await openNewAlgorithmDialog(page);

  // Validation: empty title
  const titleField = dialog.getByLabel("Title", { exact: true });
  await titleField.click();
  await titleField.clear();
  await titleField.blur();

  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "New preset", exact: true })).toBeVisible();

  // Success
  await titleField.fill("My Test Algorithm");

  const createButton = dialog.getByRole("button", { name: "Create", exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const redirectLink = dialog.getByRole("link", { name: "Go to the new preset", exact: true });
  await expect(redirectLink).toBeVisible();
  await redirectLink.click();

  await expect(page).toHaveURL(/\/algorithms\/\d+$/);
  await expect(page.getByRole("heading", { name: "My Test Algorithm", exact: true })).toBeVisible();
});
