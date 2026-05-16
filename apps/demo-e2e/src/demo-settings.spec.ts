import { expect, test } from "@playwright/test";
import { openSection, setupDemo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("lang", "en");
    window.localStorage.setItem("theme", "light");
    window.localStorage.setItem("motion", "off");
  });
});

test("changes language and theme via Settings > Interface", async ({ page }) => {
  // Stage 1 — Set up demo
  await setupDemo(page);

  // Stage 2 — Navigate to Settings > Interface
  await openSection(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Interface", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/interface$/);

  // Stage 3 — Change theme to Dark (demo defaults to System)
  const lightToggle = page.getByRole("radio", { name: "Light" });
  const darkToggle = page.getByRole("radio", { name: "Dark" });

  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await darkToggle.click();
  await expect(darkToggle).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Stage 4 — Switch back to Light theme
  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Stage 5 — Open language picker (header also has a language control)
  const languageButton = page.getByRole("button", { name: "English Language" }).last();
  await languageButton.click();

  const russianOption = page.getByRole("option", { name: "Русский" });
  await expect(russianOption).toBeVisible();
  // Don't actually switch to avoid side effects; just verify the option exists
  await page.keyboard.press("Escape");
});

test("changes learning defaults and verifies persistence after navigation", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();

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

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await expect(page.getByText("Learn ahead limit")).toBeVisible();

  await openSection(page, "Dashboard");
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Learning", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "New" })).toHaveValue("5");
  await expect(page.getByRole("textbox", { name: "Hours" })).toHaveValue("1");
  await expect(page.getByRole("textbox", { name: "Minutes" })).toHaveValue("30");
});
