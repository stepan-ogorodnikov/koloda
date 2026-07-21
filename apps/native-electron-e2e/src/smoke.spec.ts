import { expect, test } from "./fixtures";
import { openSection, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("sets up the app and reaches the core sections", async ({ page }) => {
  await setupApp(page);

  await openSection(page, "Templates");
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();

  await openSection(page, "Decks");
  await expect(page).toHaveURL(/\/decks$/);
  await expect(page.getByRole("heading", { name: "Decks", exact: true })).toBeVisible();
});
