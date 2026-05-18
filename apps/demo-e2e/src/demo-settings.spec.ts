import { expect, test } from "@playwright/test";
import { openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("changes language and theme via Settings > Interface", async ({ page }) => {
  await setupDemo(page);

  // Navigate to Settings > Interface
  await openSection(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Interface", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/interface$/);

  // Change theme to Dark
  const lightToggle = page.getByRole("radio", { name: "Light" });
  const darkToggle = page.getByRole("radio", { name: "Dark" });

  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await darkToggle.click();
  await expect(darkToggle).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Switch back to Light theme
  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Open language picker
  const languageButton = page.getByRole("button", { name: "English Language" }).last();
  await languageButton.click();

  const russianOption = page.getByRole("option", { name: "Русский" });
  await expect(russianOption).toBeVisible();
  await russianOption.click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("lang"))).toBe("ru");
});

test("changes learning defaults and verifies persistence after navigation", async ({ page }) => {
  await setupDemo(page);

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
  await minutesField.fill("30");
  await minutesField.blur();

  // Save changes
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn ahead limit")).toBeVisible();

  // Navigate away and back
  await openSection(page, "Dashboard");
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();

  // Verify changes persisted
  await expect(page.getByRole("textbox", { name: "New" })).toHaveValue("5");
  await expect(page.getByRole("textbox", { name: "Hours" })).toHaveValue("1");
  await expect(page.getByRole("textbox", { name: "Minutes" })).toHaveValue("30");
});
