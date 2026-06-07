import { expect, test } from "@playwright/test";
import { editHotkey, getHotkeyByLabel, openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("shows error when two hotkeys in the same scope conflict", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Hotkeys", exact: true }).click();

  const kbds = page.locator("form kbd");
  await expect(kbds.first()).toBeVisible();

  // Set both "Dashboard" and "Decks" to the same hotkey
  await editHotkey(page, "Dashboard", "Control+x");
  await editHotkey(page, "Decks", "Control+x");

  // Verify error ring appears on conflicting hotkeys
  await expect(getHotkeyByLabel(page, "Dashboard").container).toHaveAttribute("data-has-error");
  await expect(getHotkeyByLabel(page, "Decks").container).toHaveAttribute("data-has-error");

  // Verify error message appears in the form controls area
  await expect(page.getByText("There are conflicting hotkeys")).toBeVisible();

  // Verify "Save" button is disabled
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeDisabled();
});

test("shows error when UI hotkey conflicts with another scope", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Hotkeys", exact: true }).click();

  const kbds = page.locator("form kbd");
  await expect(kbds.first()).toBeVisible();

  // Set "Navigation" > "Dashboard" to a specific key
  await editHotkey(page, "Dashboard", "Control+z");

  // Set "UI" > "Submit text field" to the same key - should conflict across scopes
  await editHotkey(page, "Submit text field", "Control+z");

  // Verify error ring appears on conflicting hotkeys
  await expect(getHotkeyByLabel(page, "Submit text field").container).toHaveAttribute("data-has-error");
  await expect(getHotkeyByLabel(page, "Dashboard").container).toHaveAttribute("data-has-error");

  // Verify error message appears in the form controls area
  await expect(page.getByText("There are conflicting hotkeys")).toBeVisible();

  // Verify "Save" button is disabled
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeDisabled();
});
