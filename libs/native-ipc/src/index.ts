// Machine-checked contract for the full desktop renderer<->main command surface:
// data commands (`apps/electron/src/data-ipc.ts`), AI commands
// (`src/ai-ipc.ts`), and the `AI_STREAM_CHANNEL` push channel, all consumed by
// the renderer through `invoke`.
//
// Each channel maps to `{ args; result }` — the shapes crossing
// `window.electronAPI.invoke` before `toWire`/`fromWire` coercion. Data-command
// arg conventions mirror the `KolodaDb` NAPI signatures: `{ params }` for reads,
// `{ data }` for writes, or the plain object where the method takes one.
//
// INVARIANT: there is deliberately no channel for AI profile secrets. Secrets
// load main-side only (`ai-ipc.ts`); do not add a `cmd_*` entry for them.
import type {
  AddAIProfileData,
  AIModel,
  AIProfile,
  ChatStreamChunk,
  ChatStreamRequest,
  RemoveAIProfileData,
  StreamUsage,
  UpdateAIProfileData,
} from "@koloda/ai";
import type {
  Conversation,
  DeleteConversationData,
  HotkeysSettings,
  InterfaceSettings,
  LearningSettings,
  SetConversationData,
} from "@koloda/app";
import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/settings";
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

/**
 * Main-to-renderer push channel for AI streaming (see `AiStreamEvent`).
 * Single source of truth for `ai-ipc.ts` and the renderer runtime adapter.
 */
export const AI_STREAM_CHANNEL = "ai:stream";

/**
 * Events streamed main-to-renderer on `AI_STREAM_CHANNEL`, all keyed by
 * `requestId` so concurrent runs can be correlated and aborted individually.
 */
export type AiStreamEvent =
  | { requestId: string; type: "chunk"; chunk: ChatStreamChunk }
  | { requestId: string; type: "toolCall"; call: { id: string; name: string; input: unknown } }
  | { requestId: string; type: "toolResult"; callId: string; output?: unknown; error?: string }
  | { requestId: string; type: "done"; usage?: StreamUsage }
  | { requestId: string; type: "error"; code: string; message: string };

export interface DataIpc {
  get_db_status: { args: undefined; result: DbStatus };
  seed_db: { args: { data: SeedDbData }; result: true };

  cmd_get_cards: { args: { params: GetCardsParams }; result: Card[] };
  cmd_get_card: { args: { id: string }; result: Card | null };
  cmd_add_card: { args: { data: InsertCardData }; result: Card };
  cmd_add_cards: { args: { data: InsertCardData[] }; result: InsertCardsResponse };
  cmd_update_card: { args: { data: UpdateCardData }; result: Card };
  cmd_delete_card: { args: { data: DeleteCardData }; result: void };
  cmd_delete_cards: { args: { data: DeleteCardsData }; result: void };
  cmd_reset_card_progress: { args: { data: ResetCardProgressData }; result: Card };

  cmd_get_algorithms: { args: undefined; result: Algorithm[] };
  cmd_get_algorithm: { args: { id: string }; result: Algorithm | null };
  cmd_add_algorithm: { args: { data: InsertAlgorithmData }; result: Algorithm };
  cmd_clone_algorithm: { args: { data: CloneAlgorithmData }; result: Algorithm };
  cmd_update_algorithm: { args: { data: UpdateAlgorithmData }; result: Algorithm };
  cmd_delete_algorithm: { args: { data: DeleteAlgorithmData }; result: void };
  cmd_get_algorithm_decks: { args: { id: string }; result: DeckWithOnlyTitle[] };

  cmd_get_decks: { args: undefined; result: Deck[] };
  cmd_get_deck: { args: { id: string }; result: Deck | null };
  cmd_add_deck: { args: { data: InsertDeckData }; result: Deck };
  cmd_update_deck: { args: { data: UpdateDeckData }; result: Deck };
  cmd_delete_deck: { args: { data: DeleteDeckData }; result: void };

  cmd_get_templates: { args: undefined; result: Template[] };
  cmd_get_template: { args: { id: string }; result: Template | null };
  cmd_add_template: { args: { data: InsertTemplateData }; result: Template };
  cmd_clone_template: { args: { data: CloneTemplateData }; result: Template };
  cmd_update_template: { args: { data: UpdateTemplateData }; result: Template };
  cmd_delete_template: { args: { data: DeleteTemplateData }; result: void };
  cmd_get_template_decks: { args: { id: string }; result: DeckWithOnlyTitle[] };

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

  // AI assistant commands (`ai-ipc.ts`). Secrets load main-side only.
  // `cmd_ai_chat_stream` returns immediately; the run streams events on
  // `AI_STREAM_CHANNEL`, all keyed by `requestId`.
  cmd_ai_list_models: { args: { profileId: string }; result: AIModel[] };
  cmd_ai_chat_stream: { args: { requestId: string; profileId: string; request: ChatStreamRequest }; result: void };
  cmd_ai_abort: { args: { requestId: string }; result: void };
}

export type DataChannel = keyof DataIpc;

/**
 * Channels registered by `ai-ipc.ts` (secrets-capable main-side glue) rather
 * than by the data handler table in `data-ipc.ts`.
 */
export type AiChannel = "cmd_ai_list_models" | "cmd_ai_chat_stream" | "cmd_ai_abort";

/** Channels served by the `KolodaDb`-backed handler table in `data-ipc.ts`. */
export type DataOnlyChannel = Exclude<DataChannel, AiChannel>;

export type IpcArgs<C extends DataChannel> = DataIpc[C]["args"];

export type IpcResult<C extends DataChannel> = DataIpc[C]["result"];
