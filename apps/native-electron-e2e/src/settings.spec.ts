import { expect, test } from "./fixtures";
import { openSection, setupApp, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("changes language and scheme via Settings > Interface", async ({ page }) => {
  await setupApp(page);

  await openSection(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Interface", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/interface$/);

  const lightToggle = page.getByRole("radio", { name: "Light" });
  const darkToggle = page.getByRole("radio", { name: "Dark" });

  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await darkToggle.click();
  await expect(darkToggle).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-dark-theme", "atom-one-dark");

  await lightToggle.click();
  await expect(lightToggle).toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-light-theme", "atom-one-light");

  const languageButton = page.getByRole("button", { name: "English Language" }).last();
  await languageButton.click();

  const russianOption = page.getByRole("option", { name: "Русский" });
  await expect(russianOption).toBeVisible();
  await russianOption.click();
  // Electron persists language in settings DB, not localStorage.
  await expect(page.getByRole("heading", { name: "Интерфейс", exact: true })).toBeVisible();
});

test("changes learning defaults and verifies persistence after navigation", async ({ page }) => {
  await setupApp(page);

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
