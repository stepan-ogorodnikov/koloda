import { expect, test } from "@playwright/test";
import {
  changeInterfaceThemeMotionAndDateFormat,
  expectInterfaceChangesKept,
  openInterfaceSettings,
  openLearningSettings,
  openSection,
} from "@koloda/e2e";
import { setupWeb, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("changes language and scheme via Settings > Interface", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await setupWeb(page);

  // Navigate to Settings > Interface
  await openSection(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Interface", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/interface$/);

  // Change scheme to Dark
  const lightToggle = page.getByRole("radio", { name: "Light" });
  const darkToggle = page.getByRole("radio", { name: "Dark" });

  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await darkToggle.click();
  await expect(darkToggle).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-dark-theme", "github-dark");

  // Switch back to Light scheme
  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-light-theme", "github-light");

  // Open language picker
  const languageButton = page.getByRole("button", { name: "English Language" }).last();
  await languageButton.click();

  const russianOption = page.getByRole("option", { name: "Русский" });
  await expect(russianOption).toBeVisible();
  await russianOption.click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("lang"))).toBe("ru");

  // Pressing the already selected Light first must not throw either
  expect(pageErrors).toEqual([]);
});

test("changes theme, animations, and date format and keeps them after a reload", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await setupWeb(page);

  await openInterfaceSettings(page);
  await changeInterfaceThemeMotionAndDateFormat(page);

  // Reload, so the screen reads the stored settings: the init script reseeds the device cache with the defaults
  await page.reload({ waitUntil: "domcontentloaded" });
  await openInterfaceSettings(page);
  await expectInterfaceChangesKept(page);

  expect(pageErrors).toEqual([]);
});

test("changes learning limits and learn-ahead and keeps them after a reload", async ({ page }) => {
  await setupWeb(page);

  // Navigate to Settings > Learning
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();

  // Update values
  const newLimitField = page.getByRole("textbox", { name: "New" });
  await newLimitField.click();
  await newLimitField.clear();
  await newLimitField.fill("5");
  await newLimitField.blur();

  const hoursField = page.getByRole("textbox", { name: "Hours" });
  await hoursField.click();
  await hoursField.clear();
  await hoursField.fill("1");
  await hoursField.blur();

  const minutesField = page.getByRole("textbox", { name: "Minutes" });
  await minutesField.click();
  await minutesField.clear();
  await minutesField.fill("45");
  await minutesField.blur();

  // Save changes
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(saveButton).toBeHidden();

  // Reload, so the form reads the stored settings rather than the query cache
  await page.reload({ waitUntil: "domcontentloaded" });
  await openLearningSettings(page);

  // Verify changes persisted
  await expect(page.getByRole("textbox", { name: "New" })).toHaveValue("5");
  await expect(page.getByRole("textbox", { name: "Hours" })).toHaveValue("1");
  await expect(page.getByRole("textbox", { name: "Minutes" })).toHaveValue("45");
});
