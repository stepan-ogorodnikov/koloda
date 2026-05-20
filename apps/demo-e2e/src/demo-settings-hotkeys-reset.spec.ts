import { expect, test } from "@playwright/test";
import { openSection, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("discards changes to hotkeys settings and resets form to persisted state", async ({ page }) => {
  await setupDemo(page);

  // Navigate to Settings > Hotkeys
  await openSection(page, "Settings");
  await page.getByRole("link", { name: "Hotkeys", exact: true }).click();

  // Wait for hotkeys to render
  const kbds = page.locator("form kbd");
  await expect(kbds.first()).toBeVisible();

  // Hotkey order by section:
  // Forms: Save(0), Discard(1)
  // UI: Submit text field(2), Focus forward(3), Focus backward(4), Go to next tab(5), Go to previous tab(6), Close popover(7)
  // Navigation: Dashboard(8), Decks(9), Presets(10), Templates(11), Settings(12)
  // Grades: Again(13), Hard(14), Normal(15), Easy(16)

  // Capture initial values
  const initialFormSave = await kbds.nth(0).innerText();
  const initialNavDashboard = await kbds.nth(8).innerText();
  const initialNavDecks = await kbds.nth(9).innerText();
  const initialGradesAgain = await kbds.nth(13).innerText();
  const initialGradesHard = await kbds.nth(14).innerText();
  const initialGradesNormal = await kbds.nth(15).innerText();

  // Helper to edit a hotkey by its kbd index
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

  // Change hotkeys
  await editHotkeyByIndex(0, "Control+a");
  await editHotkeyByIndex(8, "Control+h");
  await editHotkeyByIndex(9, "Control+d");
  await editHotkeyByIndex(13, "Control+1");
  await editHotkeyByIndex(14, "Control+2");
  await editHotkeyByIndex(15, "Control+3");

  // Click "Discard" to reset the form
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  // Verify form reset to original persisted values
  await expect(kbds.nth(0)).toHaveText(initialFormSave);
  await expect(kbds.nth(8)).toHaveText(initialNavDashboard);
  await expect(kbds.nth(9)).toHaveText(initialNavDecks);
  await expect(kbds.nth(13)).toHaveText(initialGradesAgain);
  await expect(kbds.nth(14)).toHaveText(initialGradesHard);
  await expect(kbds.nth(15)).toHaveText(initialGradesNormal);
});
