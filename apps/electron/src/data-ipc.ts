import { ipcMain } from "electron";
import type { DataOnlyChannel, IpcArgs, IpcResult } from "@koloda/native-ipc";
import { registerAiIpc } from "./ai-ipc";
import type { KolodaDb } from "./koloda-db";

type DataHandler = (
  db: KolodaDb,
  args: IpcArgs<DataOnlyChannel>,
) => IpcResult<DataOnlyChannel> | Promise<IpcResult<DataOnlyChannel>>;

// One entry per non-AI `DataIpc` channel (AI channels register in `ai-ipc.ts`).
// The `satisfies` below fails the build when a channel has no entry or a
// handler's args/result drift from the contract; the per-entry `IpcArgs<C>`
// annotations give each handler its checked arg type.
const dataHandlers = {
  get_db_status: (db) => db.getDbStatus(),
  seed_db: async (db, { data }: IpcArgs<"seed_db">): Promise<IpcResult<"seed_db">> => {
    await db.seedDb(data);
    return true;
  },

  cmd_get_cards: (db, { params }: IpcArgs<"cmd_get_cards">) => db.getCards(params),
  cmd_get_card: (db, args: IpcArgs<"cmd_get_card">) => db.getCard(args),
  cmd_add_card: (db, { data }: IpcArgs<"cmd_add_card">) => db.addCard(data),
  cmd_add_cards: (db, { data }: IpcArgs<"cmd_add_cards">) => db.addCards(data),
  cmd_update_card: (db, { data }: IpcArgs<"cmd_update_card">) => db.updateCard(data),
  cmd_delete_card: (db, { data }: IpcArgs<"cmd_delete_card">) => db.deleteCard(data),
  cmd_delete_cards: (db, { data }: IpcArgs<"cmd_delete_cards">) => db.deleteCards(data),
  cmd_reset_card_progress: (db, { data }: IpcArgs<"cmd_reset_card_progress">) => db.resetCardProgress(data),

  cmd_get_algorithms: (db) => db.getAlgorithms(),
  cmd_get_algorithm: (db, args: IpcArgs<"cmd_get_algorithm">) => db.getAlgorithm(args),
  cmd_add_algorithm: (db, { data }: IpcArgs<"cmd_add_algorithm">) => db.addAlgorithm(data),
  cmd_clone_algorithm: (db, { data }: IpcArgs<"cmd_clone_algorithm">) => db.cloneAlgorithm(data),
  cmd_update_algorithm: (db, { data }: IpcArgs<"cmd_update_algorithm">) => db.updateAlgorithm(data),
  cmd_delete_algorithm: (db, { data }: IpcArgs<"cmd_delete_algorithm">) => db.deleteAlgorithm(data),
  cmd_get_algorithm_decks: (db, args: IpcArgs<"cmd_get_algorithm_decks">) => db.getAlgorithmDecks(args),

  cmd_get_decks: (db) => db.getDecks(),
  cmd_get_deck: (db, args: IpcArgs<"cmd_get_deck">) => db.getDeck(args),
  cmd_add_deck: (db, { data }: IpcArgs<"cmd_add_deck">) => db.addDeck(data),
  cmd_update_deck: (db, { data }: IpcArgs<"cmd_update_deck">) => db.updateDeck(data),
  cmd_delete_deck: (db, { data }: IpcArgs<"cmd_delete_deck">) => db.deleteDeck(data),

  cmd_get_templates: (db) => db.getTemplates(),
  cmd_get_template: (db, args: IpcArgs<"cmd_get_template">) => db.getTemplate(args),
  cmd_add_template: (db, { data }: IpcArgs<"cmd_add_template">) => db.addTemplate(data),
  cmd_clone_template: (db, { data }: IpcArgs<"cmd_clone_template">) => db.cloneTemplate(data),
  cmd_update_template: (db, { data }: IpcArgs<"cmd_update_template">) => db.updateTemplate(data),
  cmd_delete_template: (db, { data }: IpcArgs<"cmd_delete_template">) => db.deleteTemplate(data),
  cmd_get_template_decks: (db, args: IpcArgs<"cmd_get_template_decks">) => db.getTemplateDecks(args),

  cmd_get_settings: (db, args: IpcArgs<"cmd_get_settings">) => db.getSettings(args),
  cmd_set_settings: (db, args: IpcArgs<"cmd_set_settings">) => db.setSettings(args),
  cmd_patch_settings: (db, args: IpcArgs<"cmd_patch_settings">) => db.patchSettings(args),

  cmd_get_conversation: (db, args: IpcArgs<"cmd_get_conversation">) => db.getConversation(args),
  cmd_get_conversations: (db) => db.getConversations(),
  cmd_set_conversation: (db, args: IpcArgs<"cmd_set_conversation">) => db.setConversation(args),
  cmd_delete_conversation: (db, args: IpcArgs<"cmd_delete_conversation">) => db.deleteConversation(args),

  cmd_get_lessons: (db, { params }: IpcArgs<"cmd_get_lessons">) => db.getLessons(params),
  cmd_get_lesson_data: (db, { params }: IpcArgs<"cmd_get_lesson_data">) => db.getLessonData(params),
  cmd_submit_lesson_result: (db, { data }: IpcArgs<"cmd_submit_lesson_result">) => db.submitLessonResult(data),

  cmd_get_reviews: (db, { data }: IpcArgs<"cmd_get_reviews">) => db.getReviews(data),
  cmd_get_review_totals: (db, { data }: IpcArgs<"cmd_get_review_totals">) => db.getReviewTotals(data),
  cmd_get_todays_review_totals: (db) => db.getTodaysReviewTotals(),

  cmd_get_ai_profiles: (db) => db.getAiProfiles(),
  cmd_add_ai_profile: (db, { data }: IpcArgs<"cmd_add_ai_profile">) => db.addAiProfile(data),
  cmd_update_ai_profile: (db, { data }: IpcArgs<"cmd_update_ai_profile">) => db.updateAiProfile(data),
  cmd_remove_ai_profile: (db, { data }: IpcArgs<"cmd_remove_ai_profile">) => db.removeAiProfile(data),
} satisfies { [C in DataOnlyChannel]: (db: KolodaDb, args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>> };

export function registerDataIpc(db: KolodaDb) {
  // WHY: `Object.entries` erases the key type, so re-anchor each pair to the
  // contract union. `satisfies` above proves every key is a `DataOnlyChannel`
  // and every handler matches its channel, so this cast only widens the type.
  for (const [channel, handler] of Object.entries(dataHandlers) as [DataOnlyChannel, DataHandler][]) {
    ipcMain.handle(channel, (_event, args: IpcArgs<DataOnlyChannel>) => handler(db, args));
  }

  // INVARIANT: AI provider calls + secret loads stay in main. Do not add cmd_* for getAiProfileSecrets.
  // WHY: ai-ipc is the single main-side secrets consumer. The addon instance
  // carries `getAiProfileSecrets`, which `KolodaDb` deliberately omits so data
  // handlers cannot reach secrets; restore the ai-ipc surface at this one call.
  registerAiIpc(db as KolodaDb & Parameters<typeof registerAiIpc>[0]);
}
