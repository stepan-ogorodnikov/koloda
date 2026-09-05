import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { applyPageDefaults, bootstrapApp } from "@koloda/e2e";

export {
  addCard,
  addLmStudioProfile,
  cardRows,
  conversationLog,
  createAlgorithm,
  createDeck,
  createDeckAndOpenAssistant,
  createDeckWithAlgorithm,
  createDeckWithCard,
  createDeckWithCards,
  createDeckWithTemplate,
  createTemplate,
  deleteAIProfile,
  dispatchGracefulShutdown,
  dragTo,
  editHotkey,
  expectDeckCardCount,
  fillAIProfileTitle,
  getConversationIdFromUrl,
  getHotkeyByLabel,
  gradeLessonCards,
  openAddAIDialog,
  openAssistantWithConversation,
  openAssistantWithDeck,
  openEditAIDialog,
  openHotkeysSettings,
  openLearningSettings,
  openLessonDialog,
  openNewDeckDialog,
  openNewPresetDialog,
  openNewTemplateDialog,
  openSection,
  reorderWithKeyboard,
  selectAIProvider,
  sendAssistantMessage,
  setLearnAheadLimit,
  startDeckLesson,
  startNewConversation,
  submitAddAIDialog,
  submitEditAIDialog,
  waitForAssistantReady,
  waitForConversationIdFromUrl,
} from "@koloda/e2e";

export async function setupPageDefaults(page: Page) {
  await applyPageDefaults(page, "before-load");
}

export async function setupDemo(page: Page) {
  await page.goto("/");
  await bootstrapApp(page, "Setting up a demo");
}

/**
 * Retention is rendered as a react-aria Slider backed by a visually hidden
 * <input type="range">. Pointer clicks on it are intercepted by the track
 * container, so values are changed by focusing the input and stepping with
 * arrow keys (native range inputs step by `step`, which is 1 here).
 */
export async function setSliderValue(page: Page, name: string, target: number) {
  const thumb = page.getByRole("slider", { name });
  await expect(thumb).toBeAttached();
  await thumb.focus();
  const current = Number(await thumb.inputValue());
  if (current === target) return;
  const key = target > current ? "ArrowRight" : "ArrowLeft";
  for (let i = 0; i < Math.abs(target - current); i++) {
    await page.keyboard.press(key);
  }
  await expect(thumb).toHaveValue(String(target));
}

export async function getSliderValue(page: Page, name: string) {
  const thumb = page.getByRole("slider", { name });
  await expect(thumb).toBeAttached();
  return Number(await thumb.inputValue());
}
