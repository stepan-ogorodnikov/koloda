import { expect, test } from "@playwright/test";
import { editHotkey, getHotkeyByLabel, openSection, setupDemo, setupPageDefaults } from "./helpers";

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

  // Capture initial values
  const initialFormSave = await getHotkeyByLabel(page, "Save").kbd.first().innerText();
  const initialNavDashboard = await getHotkeyByLabel(page, "Dashboard").kbd.first().innerText();
  const initialNavDecks = await getHotkeyByLabel(page, "Decks").kbd.first().innerText();
  const initialGradesAgain = await getHotkeyByLabel(page, "Again").kbd.first().innerText();
  const initialGradesHard = await getHotkeyByLabel(page, "Hard").kbd.first().innerText();
  const initialGradesNormal = await getHotkeyByLabel(page, "Normal").kbd.first().innerText();

  // Change hotkeys
  await editHotkey(page, "Save", "Control+a");
  await editHotkey(page, "Dashboard", "Control+h");
  await editHotkey(page, "Decks", "Control+d");
  await editHotkey(page, "Again", "Control+1");
  await editHotkey(page, "Hard", "Control+2");
  await editHotkey(page, "Normal", "Control+3");

  // Click "Discard" to reset the form
  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  // Verify form reset to original persisted values
  await expect(getHotkeyByLabel(page, "Save").kbd.first()).toHaveText(initialFormSave);
  await expect(getHotkeyByLabel(page, "Dashboard").kbd.first()).toHaveText(initialNavDashboard);
  await expect(getHotkeyByLabel(page, "Decks").kbd.first()).toHaveText(initialNavDecks);
  await expect(getHotkeyByLabel(page, "Again").kbd.first()).toHaveText(initialGradesAgain);
  await expect(getHotkeyByLabel(page, "Hard").kbd.first()).toHaveText(initialGradesHard);
  await expect(getHotkeyByLabel(page, "Normal").kbd.first()).toHaveText(initialGradesNormal);
});
