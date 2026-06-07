import { expect, test } from "@playwright/test";
import { editHotkey, getHotkeyByLabel, openHotkeysSettings, setupDemo, setupPageDefaults } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupPageDefaults(page);
});

test("validates conflicts and resets the hotkeys settings form", async ({ page }) => {
  await setupDemo(page);
  await openHotkeysSettings(page);

  const saveButton = page.locator("form").getByRole("button", { name: "Save", exact: true });

  // Capture initial defaults from a clean form
  const initialFormSave = await getHotkeyByLabel(page, "Save").kbd.first().innerText();
  const initialNavDashboard = await getHotkeyByLabel(page, "Dashboard").kbd.first().innerText();
  const initialNavDecks = await getHotkeyByLabel(page, "Decks").kbd.first().innerText();
  const initialGradesAgain = await getHotkeyByLabel(page, "Again").kbd.first().innerText();
  const initialGradesHard = await getHotkeyByLabel(page, "Hard").kbd.first().innerText();
  const initialGradesNormal = await getHotkeyByLabel(page, "Normal").kbd.first().innerText();

  // Same-scope conflict validation
  await editHotkey(page, "Dashboard", "Control+x");
  await editHotkey(page, "Decks", "Control+x");

  await expect(getHotkeyByLabel(page, "Dashboard").container).toHaveAttribute("data-has-error");
  await expect(getHotkeyByLabel(page, "Decks").container).toHaveAttribute("data-has-error");
  await expect(page.getByText("There are conflicting hotkeys")).toBeVisible();
  await expect(saveButton).toBeDisabled();

  // Cross-scope conflict validation
  await editHotkey(page, "Dashboard", "Control+z");
  await editHotkey(page, "Submit text field", "Control+z");

  await expect(getHotkeyByLabel(page, "Submit text field").container).toHaveAttribute("data-has-error");
  await expect(getHotkeyByLabel(page, "Dashboard").container).toHaveAttribute("data-has-error");
  await expect(page.getByText("There are conflicting hotkeys")).toBeVisible();
  await expect(saveButton).toBeDisabled();

  // Reset: change several hotkeys, click "Discard", verify revert
  await editHotkey(page, "Save", "Control+a");
  await editHotkey(page, "Dashboard", "Control+h");
  await editHotkey(page, "Decks", "Control+d");
  await editHotkey(page, "Again", "Control+1");
  await editHotkey(page, "Hard", "Control+2");
  await editHotkey(page, "Normal", "Control+3");

  const discardButton = page.locator("form").getByRole("button", { name: "Discard", exact: true });
  await expect(discardButton).toBeVisible();
  await discardButton.click();

  await expect(getHotkeyByLabel(page, "Save").kbd.first()).toHaveText(initialFormSave);
  await expect(getHotkeyByLabel(page, "Dashboard").kbd.first()).toHaveText(initialNavDashboard);
  await expect(getHotkeyByLabel(page, "Decks").kbd.first()).toHaveText(initialNavDecks);
  await expect(getHotkeyByLabel(page, "Again").kbd.first()).toHaveText(initialGradesAgain);
  await expect(getHotkeyByLabel(page, "Hard").kbd.first()).toHaveText(initialGradesHard);
  await expect(getHotkeyByLabel(page, "Normal").kbd.first()).toHaveText(initialGradesNormal);
});
