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
  getSliderValue,
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
  setSliderValue,
  startDeckLesson,
  startNewConversation,
  submitAddAIDialog,
  submitEditAIDialog,
  waitForAssistantReady,
  waitForConversationIdFromUrl,
} from "@koloda/e2e";

export async function setupPageDefaults(page: Page) {
  await applyPageDefaults(page, "after-load");
}

export async function setupApp(page: Page) {
  await bootstrapApp(page, "Setting up your database");
}
