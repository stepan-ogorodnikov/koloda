import { ipcMain } from "electron";
import { registerAiIpc } from "./ai-ipc";
import type { KolodaDb } from "./koloda-db";

export function registerDataIpc(db: KolodaDb) {
  ipcMain.handle("get_db_status", async () => db.getDbStatus());

  ipcMain.handle("seed_db", async (_event, { data }: any) => {
    await db.seedDb(data);
    return true;
  });

  ipcMain.handle("cmd_get_cards", async (_event, { params }: any) => db.getCards(params));
  ipcMain.handle("cmd_get_card", async (_event, args: any) => db.getCard(args));
  ipcMain.handle("cmd_add_card", async (_event, { data }: any) => db.addCard(data));
  ipcMain.handle("cmd_add_cards", async (_event, { data }: any) => db.addCards(data));
  ipcMain.handle("cmd_update_card", async (_event, { data }: any) => db.updateCard(data));
  ipcMain.handle("cmd_delete_card", async (_event, { data }: any) => db.deleteCard(data));
  ipcMain.handle("cmd_delete_cards", async (_event, { data }: any) => db.deleteCards(data));
  ipcMain.handle("cmd_reset_card_progress", async (_event, { data }: any) => db.resetCardProgress(data));

  ipcMain.handle("cmd_get_algorithms", async () => db.getAlgorithms());
  ipcMain.handle("cmd_get_algorithm", async (_event, args: any) => db.getAlgorithm(args));
  ipcMain.handle("cmd_add_algorithm", async (_event, { data }: any) => db.addAlgorithm(data));
  ipcMain.handle("cmd_clone_algorithm", async (_event, { data }: any) => db.cloneAlgorithm(data));
  ipcMain.handle("cmd_update_algorithm", async (_event, { data }: any) => db.updateAlgorithm(data));
  ipcMain.handle("cmd_delete_algorithm", async (_event, { data }: any) => db.deleteAlgorithm(data));
  ipcMain.handle("cmd_get_algorithm_decks", async (_event, args: any) => db.getAlgorithmDecks(args));

  ipcMain.handle("cmd_get_decks", async () => db.getDecks());
  ipcMain.handle("cmd_get_deck", async (_event, args: any) => db.getDeck(args));
  ipcMain.handle("cmd_add_deck", async (_event, { data }: any) => db.addDeck(data));
  ipcMain.handle("cmd_update_deck", async (_event, { data }: any) => db.updateDeck(data));
  ipcMain.handle("cmd_delete_deck", async (_event, { data }: any) => db.deleteDeck(data));

  ipcMain.handle("cmd_get_templates", async () => db.getTemplates());
  ipcMain.handle("cmd_get_template", async (_event, args: any) => db.getTemplate(args));
  ipcMain.handle("cmd_add_template", async (_event, { data }: any) => db.addTemplate(data));
  ipcMain.handle("cmd_clone_template", async (_event, { data }: any) => db.cloneTemplate(data));
  ipcMain.handle("cmd_update_template", async (_event, { data }: any) => db.updateTemplate(data));
  ipcMain.handle("cmd_delete_template", async (_event, { data }: any) => db.deleteTemplate(data));
  ipcMain.handle("cmd_get_template_decks", async (_event, args: any) => db.getTemplateDecks(args));

  ipcMain.handle("cmd_get_settings", async (_event, args: any) => db.getSettings(args));
  ipcMain.handle("cmd_set_settings", async (_event, args: any) => db.setSettings(args));
  ipcMain.handle("cmd_patch_settings", async (_event, args: any) => db.patchSettings(args));

  ipcMain.handle("cmd_get_conversation", async (_event, args: any) => db.getConversation(args));
  ipcMain.handle("cmd_get_conversations", async () => db.getConversations());
  ipcMain.handle("cmd_set_conversation", async (_event, args: any) => db.setConversation(args));
  ipcMain.handle("cmd_delete_conversation", async (_event, args: any) => db.deleteConversation(args));

  ipcMain.handle("cmd_get_lessons", async (_event, { params }: any) => db.getLessons(params));
  ipcMain.handle("cmd_get_lesson_data", async (_event, { params }: any) => db.getLessonData(params));
  ipcMain.handle("cmd_submit_lesson_result", async (_event, { data }: any) => db.submitLessonResult(data));

  ipcMain.handle("cmd_get_reviews", async (_event, { data }: any) => db.getReviews(data));
  ipcMain.handle("cmd_get_review_totals", async (_event, { data }: any) => db.getReviewTotals(data));
  ipcMain.handle("cmd_get_todays_review_totals", async () => db.getTodaysReviewTotals());

  ipcMain.handle("cmd_get_ai_profiles", async () => db.getAiProfiles());
  ipcMain.handle("cmd_add_ai_profile", async (_event, { data }: any) => db.addAiProfile(data));
  ipcMain.handle("cmd_update_ai_profile", async (_event, { data }: any) => db.updateAiProfile(data));
  ipcMain.handle("cmd_remove_ai_profile", async (_event, { data }: any) => db.removeAiProfile(data));

  // INVARIANT: AI provider calls + secret loads stay in main. Do not add cmd_* for getAiProfileSecrets.
  // WHY: ai-ipc is the single main-side secrets consumer. The addon instance
  // carries `getAiProfileSecrets`, which `KolodaDb` deliberately omits so data
  // handlers cannot reach secrets; restore the ai-ipc surface at this one call.
  registerAiIpc(db as KolodaDb & Parameters<typeof registerAiIpc>[0]);
}
