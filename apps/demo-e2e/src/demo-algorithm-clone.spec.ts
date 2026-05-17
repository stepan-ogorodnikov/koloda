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

test("clones an existing algorithm and verifies the copy", async ({ page }) => {
  const sourceTitle = "E2E Source Algorithm";
  const clonedTitle = "E2E Cloned Algorithm";

  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Create an algorithm
  await createAlgorithm(page, sourceTitle);

  // Stage 3 — Clone it
  const cloneTrigger = page.getByRole("button", { name: "Clone preset", exact: true });
  await expect(cloneTrigger).toBeVisible();
  await cloneTrigger.click();

  const cloneDialog = page.getByRole("dialog");
  await expect(cloneDialog).toBeVisible();

  await cloneDialog.getByLabel("Title", { exact: true }).fill(clonedTitle);

  const cloneButton = cloneDialog.getByRole("button", { name: "Clone", exact: true });
  await expect(cloneButton).toBeEnabled();
  await cloneButton.click();

  await expect(cloneDialog.getByRole("link", { name: "Go to the new preset", exact: true })).toBeVisible();
  await cloneDialog.getByRole("link", { name: "Go to the new preset", exact: true }).click();

  // Stage 4 — Verify the cloned algorithm page
  await expect(page).toHaveURL(/\/algorithms\/\d+$/);
  await expect(page.getByRole("heading", { name: clonedTitle, exact: true })).toBeVisible();

  // Stage 5 — Verify both exist in the list
  await openSection(page, "Presets");
  await expect(page.getByRole("link", { name: sourceTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: clonedTitle, exact: true })).toBeVisible();
});
