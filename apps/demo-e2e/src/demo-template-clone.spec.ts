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

test("clones an existing template and verifies the copy has a new title", async ({ page }) => {
  const sourceTitle = "E2E Source Template";
  const clonedTitle = "E2E Cloned Template";

  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Create a template
  await createTemplate(page, sourceTitle);

  // Stage 3 — Open the clone dialog
  const cloneTrigger = page.getByRole("button", { name: "Clone template", exact: true });
  await expect(cloneTrigger).toBeVisible();
  await cloneTrigger.click();

  const cloneDialog = page.getByRole("dialog");
  await expect(cloneDialog).toBeVisible();

  // Stage 4 — Fill in the new title and submit
  await cloneDialog.getByLabel("Title", { exact: true }).fill(clonedTitle);

  const cloneButton = cloneDialog.getByRole("button", { name: "Clone", exact: true });
  await expect(cloneButton).toBeEnabled();
  await cloneButton.click();

  // Stage 5 — Wait for success state and navigate to the cloned template
  await expect(cloneDialog.getByRole("link", { name: "Go to the new template", exact: true })).toBeVisible();
  await cloneDialog.getByRole("link", { name: "Go to the new template", exact: true }).click();

  // Stage 6 — Verify the cloned template page
  await expect(page).toHaveURL(/\/templates\/\d+$/);
  await expect(page.getByRole("heading", { name: clonedTitle, exact: true })).toBeVisible();

  // Stage 7 — Verify the source template still exists
  await openSection(page, "Templates");
  await expect(page.getByRole("link", { name: sourceTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: clonedTitle, exact: true })).toBeVisible();
});
