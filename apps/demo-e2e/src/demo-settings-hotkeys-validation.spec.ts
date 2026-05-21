import { expect, test } from "@playwright/test";
import { openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("shows error when two hotkeys in the same scope conflict", async ({ page }) => {
  await setupDemo(page);

  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Hotkeys", exact: true }).click();

  const kbds = page.locator("form kbd");
  await expect(kbds.first()).toBeVisible();

  // Navigation: Dashboard(8), Decks(9)
  async function editHotkeyByIndex(index: number, newKey: string) {
    const kbd = kbds.nth(index);
    const row = kbd.locator("xpath=ancestor::div[contains(@class, 'flex-row') and contains(@class, 'items-center')]");
    const editButton = row.getByRole("button", { name: "Change hotkey" });
    await editButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press(newKey);

    await dialog.getByRole("button", { name: "Accept this hotkey" }).click();
    await expect(dialog).not.toBeVisible();
  }

  // Set both "Dashboard" and "Decks" to the same hotkey
  await editHotkeyByIndex(8, "Control+x");
  await editHotkeyByIndex(9, "Control+x");

  // Verify error ring appears on conflicting hotkeys
  const dashboardKbd = kbds.nth(8);
  const decksKbd = kbds.nth(9);
  const dashboardContainer = dashboardKbd.locator("xpath=ancestor::div[contains(@class, 'rounded-md')]");
  const decksContainer = decksKbd.locator("xpath=ancestor::div[contains(@class, 'rounded-md')]");

  await expect(dashboardContainer).toHaveAttribute("data-has-error");
  await expect(decksContainer).toHaveAttribute("data-has-error");

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

  // UI: Submit text field(2), Navigation: Dashboard(8)
  async function editHotkeyByIndex(index: number, newKey: string) {
    const kbd = kbds.nth(index);
    const row = kbd.locator("xpath=ancestor::div[contains(@class, 'flex-row') and contains(@class, 'items-center')]");
    const editButton = row.getByRole("button", { name: "Change hotkey" });
    await editButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press(newKey);

    await dialog.getByRole("button", { name: "Accept this hotkey" }).click();
    await expect(dialog).not.toBeVisible();
  }

  // Set "Navigation" > "Dashboard" to a specific key
  await editHotkeyByIndex(8, "Control+z");

  // Set "UI" > "Submit" to the same key - should conflict across scopes
  await editHotkeyByIndex(2, "Control+z");

  // Verify error ring appears on conflicting hotkeys
  const uiSubmitKbd = kbds.nth(2);
  const navDashboardKbd = kbds.nth(8);
  const uiContainer = uiSubmitKbd.locator("xpath=ancestor::div[contains(@class, 'rounded-md')]");
  const navContainer = navDashboardKbd.locator("xpath=ancestor::div[contains(@class, 'rounded-md')]");

  await expect(uiContainer).toHaveAttribute("data-has-error");
  await expect(navContainer).toHaveAttribute("data-has-error");

  // Verify error message appears in the form controls area
  await expect(page.getByText("There are conflicting hotkeys")).toBeVisible();

  // Verify "Save" button is disabled
  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeDisabled();
});
