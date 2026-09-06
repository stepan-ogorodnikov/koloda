// Machine-checked contract for the desktop data IPC surface
// (`apps/native-electron/src/data-ipc.ts` <-> renderer `invoke`).
//
// Each channel maps to `{ args; result }` — the shapes crossing
// `window.electronAPI.invoke` before `toWire`/`fromWire` coercion. Arg
// conventions mirror the `KolodaDb` NAPI signatures: `{ params }` for reads,
// `{ data }` for writes, or the plain object where the method takes one.
//
// INVARIANT: there is deliberately no channel for AI profile secrets. Secrets
// load main-side only (`ai-ipc.ts`); do not add a `cmd_*` entry for them.
import type { AddAIProfileData, AIProfile, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import type {
  AllowedSettings,
  Conversation,
  DeleteConversationData,
  HotkeysSettings,
  InterfaceSettings,
  LearningSettings,
  PatchSettingsData,
  SetConversationData,
  SetSettingsData,
  SettingsName,
} from "@koloda/app";
import type {
  Algorithm,
  Card,
  CloneAlgorithmData,
  CloneTemplateData,
  Deck,
  DeckWithOnlyTitle,
  DeleteAlgorithmData,
  DeleteCardData,
  DeleteCardsData,
  DeleteDeckData,
  DeleteTemplateData,
  GetCardsParams,
  GetLessonDataParams,
  GetReviewsData,
  InsertAlgorithmData,
  InsertCardData,
  InsertCardsResponse,
  InsertDeckData,
  InsertTemplateData,
  LessonData,
  LessonFilters,
  LessonResultData,
  LessonsResult,
  ResetCardProgressData,
  Review,
  Template,
  TodaysReviewTotals,
  UpdateAlgorithmData,
  UpdateCardData,
  UpdateDeckData,
  UpdateTemplateData,
} from "@koloda/srs";

/** Lifecycle status reported by `get_db_status` (mirrors Rust `DbStatus`). */
export type DbStatus = "blank" | "ok";

/** First-run payload for `seed_db` (mirrors Rust `SeedData`). */
export type SeedDbData = {
  algorithm: InsertAlgorithmData;
  template: InsertTemplateData;
  settings: {
    interface: InterfaceSettings;
    learning: LearningSettings;
    hotkeys: HotkeysSettings;
  };
};

/** Lesson queue query for `cmd_get_lessons` (mirrors Rust `GetLessonsParams`). */
export type GetLessonsParams = {
  dueAt: number;
  filters?: LessonFilters;
};

/** Review-window query for `cmd_get_review_totals` (mirrors Rust `GetReviewTotalsParams`). */
export type ReviewTotalsParams = {
  from: number;
  to: number;
};

/** Per-lesson-type review counts (mirrors Rust `ReviewTotals`). */
export type ReviewTotals = {
  untouched: number;
  learn: number;
  review: number;
  total: number;
};

export interface DataIpc {
  get_db_status: { args: undefined; result: DbStatus };
  seed_db: { args: { data: SeedDbData }; result: true };

  cmd_get_cards: { args: { params: GetCardsParams }; result: Card[] };
  cmd_get_card: { args: { id: number }; result: Card | null };
  cmd_add_card: { args: { data: InsertCardData }; result: Card };
  cmd_add_cards: { args: { data: InsertCardData[] }; result: InsertCardsResponse };
  cmd_update_card: { args: { data: UpdateCardData }; result: Card };
  cmd_delete_card: { args: { data: DeleteCardData }; result: void };
  cmd_delete_cards: { args: { data: DeleteCardsData }; result: void };
  cmd_reset_card_progress: { args: { data: ResetCardProgressData }; result: Card };

  cmd_get_algorithms: { args: undefined; result: Algorithm[] };
  cmd_get_algorithm: { args: { id: number }; result: Algorithm | null };
  cmd_add_algorithm: { args: { data: InsertAlgorithmData }; result: Algorithm };
  cmd_clone_algorithm: { args: { data: CloneAlgorithmData }; result: Algorithm };
  cmd_update_algorithm: { args: { data: UpdateAlgorithmData }; result: Algorithm };
  cmd_delete_algorithm: { args: { data: DeleteAlgorithmData }; result: void };
  cmd_get_algorithm_decks: { args: { id: number }; result: DeckWithOnlyTitle[] };

  cmd_get_decks: { args: undefined; result: Deck[] };
  cmd_get_deck: { args: { id: number }; result: Deck | null };
  cmd_add_deck: { args: { data: InsertDeckData }; result: Deck };
  cmd_update_deck: { args: { data: UpdateDeckData }; result: Deck };
  cmd_delete_deck: { args: { data: DeleteDeckData }; result: void };

  cmd_get_templates: { args: undefined; result: Template[] };
  cmd_get_template: { args: { id: number }; result: Template | null };
  cmd_add_template: { args: { data: InsertTemplateData }; result: Template };
  cmd_clone_template: { args: { data: CloneTemplateData }; result: Template };
  cmd_update_template: { args: { data: UpdateTemplateData }; result: Template };
  cmd_delete_template: { args: { data: DeleteTemplateData }; result: void };
  cmd_get_template_decks: { args: { id: number }; result: DeckWithOnlyTitle[] };

  cmd_get_settings: { args: { name: SettingsName }; result: AllowedSettings<SettingsName> | null };
  cmd_set_settings: { args: SetSettingsData<SettingsName>; result: AllowedSettings<SettingsName> };
  cmd_patch_settings: { args: PatchSettingsData<SettingsName>; result: AllowedSettings<SettingsName> };

  cmd_get_conversation: { args: { id: string }; result: Conversation | null };
  cmd_get_conversations: { args: undefined; result: Conversation[] };
  cmd_set_conversation: { args: SetConversationData; result: Conversation };
  cmd_delete_conversation: { args: DeleteConversationData; result: void };

  cmd_get_lessons: { args: { params: GetLessonsParams }; result: LessonsResult };
  cmd_get_lesson_data: { args: { params: GetLessonDataParams }; result: LessonData | null };
  // WHY: Rust `submit_lesson_result` returns `Result<()>`, so main replies with
  // `undefined`; the renderer's old `invoke<Review>` generic was never real.
  cmd_submit_lesson_result: { args: { data: LessonResultData }; result: void };

  cmd_get_reviews: { args: { data: GetReviewsData }; result: Review[] };
  cmd_get_review_totals: { args: { data: ReviewTotalsParams }; result: ReviewTotals };
  cmd_get_todays_review_totals: { args: undefined; result: TodaysReviewTotals };

  cmd_get_ai_profiles: { args: undefined; result: AIProfile[] };
  cmd_add_ai_profile: { args: { data: AddAIProfileData }; result: AIProfile };
  cmd_update_ai_profile: { args: { data: UpdateAIProfileData }; result: AIProfile };
  cmd_remove_ai_profile: { args: { data: RemoveAIProfileData }; result: void };
}

export type DataChannel = keyof DataIpc;

export type IpcArgs<C extends DataChannel> = DataIpc[C]["args"];

export type IpcResult<C extends DataChannel> = DataIpc[C]["result"];
