// Machine-checked contract for the full desktop renderer<->main command surface:
// data commands (`apps/electron/src/data-ipc.ts`), AI commands
// (`src/ai-ipc.ts`), sync commands (`src/sync-ipc.ts`), and the `AI_STREAM_CHANNEL`
// and `SYNC_EVENT_CHANNEL` push channels, all consumed by the renderer through `invoke`.
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
  CreateSpaceData,
  ImportMode,
  IssuedPairing,
  JoinData,
  JoinedSpace,
  PreviewRequest,
  SpacePreview,
  SetConversationData,
  SyncDevice,
  SyncStatus,
} from "@koloda/app";
import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/settings";
import type {
  AddAttachmentData,
  Algorithm,
  Attachment,
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
  SweepAttachmentsData,
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

/** Attachment read by `cmd_get_attachment`, with its bytes base64-encoded for the NAPI wire. */
export type AttachmentContentWire = Attachment & { bytes: string };

/** Payload for `cmd_add_attachment`, with its bytes base64-encoded for the NAPI wire. */
export type AddAttachmentWire = Omit<AddAttachmentData, "bytes"> & { bytes: string };

/** Starter content the sync engine creates when no algorithm or template is left (mirrors Rust `StarterWire`). */
export type SyncStarter = {
  algorithm: InsertAlgorithmData;
  template: InsertTemplateData;
};

/** Wire name of a synced kind (mirrors `Kind::as_wire` in `koloda-sync-proto`). */
export type SyncKind =
  | "cards"
  | "reviews"
  | "decks"
  | "templates"
  | "algorithms"
  | "algorithm_revisions"
  | "settings.learning";

/** Lesson queue query for `cmd_get_lessons` (mirrors Rust `GetLessonsParams`). */
export type GetLessonsParams = {
  dueAt: number;
  filters?: LessonFilters;
};

/**
 * Main-to-renderer push channel for AI streaming (see `AiStreamEvent`).
 * Single source of truth for `ai-ipc.ts` and the renderer runtime adapter.
 */
export const AI_STREAM_CHANNEL = "ai:stream";

/** Main-to-renderer push channel for sync engine events (see `SyncEvent`). */
export const SYNC_EVENT_CHANNEL = "sync:event";

/**
 * Window-close handshake channels (see `apps/electron/src/window-close-coordinator.ts`
 * and `apps/electron-react/src/app/electron-close-coordination.ts`).
 * Single source of truth — do not redeclare these literals elsewhere.
 */

/** Main → renderer: begin interrupt + bounded persistence flush. */
export const APP_SHUTDOWN_REQUEST_CHANNEL = "app:shutdown-request";

/** Renderer → main: interrupt + flush settled (or bounded flush timed out in renderer). */
export const APP_SHUTDOWN_ACK_CHANNEL = "app:shutdown-ack";

/** Renderer → main titlebar window controls. Single source of truth — do not redeclare these literals elsewhere. */

export const WINDOW_MAXIMIZE_CHANNEL = "window:maximize";

export const WINDOW_SET_TITLE_BAR_OVERLAY_CHANNEL = "window:set-title-bar-overlay";

export const WINDOW_SET_WINDOW_BUTTON_POSITION_CHANNEL = "window:set-window-button-position";

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

/**
 * Events the sync engine sends on `SYNC_EVENT_CHANNEL` (mirrors Rust `EventWire`).
 * Main logs `error` events and forwards the rest to every window.
 */
export type SyncEvent =
  | { type: "changed"; kinds: SyncKind[] }
  | { type: "status"; status: SyncStatus }
  | { type: "attachmentsFetched"; ids: string[] };

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

  cmd_get_reviews: { args: { params: GetReviewsData }; result: Review[] };
  cmd_get_todays_review_totals: { args: undefined; result: TodaysReviewTotals };

  cmd_get_attachment: { args: { id: string }; result: AttachmentContentWire | null };
  cmd_add_attachment: { args: { data: AddAttachmentWire }; result: Attachment };
  cmd_sweep_attachments: { args: { data: SweepAttachmentsData }; result: void };

  // Media commands (`media-ipc.ts`): the fetch runs in main, which CORS does not apply to.
  cmd_add_attachment_from_url: { args: { url: string }; result: Attachment };

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

  // Sync commands (`sync-ipc.ts`). Engine events stream on `SYNC_EVENT_CHANNEL`.
  cmd_sync_start: { args: { starter: SyncStarter }; result: SyncStatus };
  cmd_sync_status: { args: undefined; result: SyncStatus };
  cmd_sync_nudge: { args: undefined; result: void };
  cmd_sync_create_space: { args: { data: CreateSpaceData }; result: SyncStatus };
  cmd_sync_issue_pairing: { args: undefined; result: IssuedPairing };
  cmd_sync_devices: { args: undefined; result: SyncDevice[] };
  cmd_sync_revoke_device: { args: { id: string }; result: void };
  cmd_sync_detach: { args: undefined; result: SyncStatus };
  cmd_sync_preview: { args: { data: PreviewRequest }; result: SpacePreview };
  // `settings` seed a blank database only; a used one keeps its own.
  cmd_sync_join: { args: { data: JoinData & { settings: SeedDbData["settings"] } }; result: JoinedSpace };
  cmd_sync_import: { args: { mode: ImportMode }; result: SyncStatus };
  cmd_sync_accept_restore: { args: undefined; result: SyncStatus };
  // The OS host name, which main reads; the default name of this device in a space.
  cmd_sync_device_name: { args: undefined; result: string };
}

export type DataChannel = keyof DataIpc;

/**
 * Channels registered by `ai-ipc.ts` (secrets-capable main-side glue) rather
 * than by the data handler table in `data-ipc.ts`.
 */
type AiChannel = "cmd_ai_list_models" | "cmd_ai_chat_stream" | "cmd_ai_abort";

/** Channels registered by `media-ipc.ts` (network access in main) rather than by `data-ipc.ts`. */
type MediaChannel = "cmd_add_attachment_from_url";

/** Channels registered by `sync-ipc.ts`, which hands the engine main's event broadcaster. */
type SyncChannel =
  | "cmd_sync_start"
  | "cmd_sync_status"
  | "cmd_sync_nudge"
  | "cmd_sync_create_space"
  | "cmd_sync_issue_pairing"
  | "cmd_sync_devices"
  | "cmd_sync_revoke_device"
  | "cmd_sync_detach"
  | "cmd_sync_preview"
  | "cmd_sync_join"
  | "cmd_sync_import"
  | "cmd_sync_accept_restore"
  | "cmd_sync_device_name";

/** Channels served by the `KolodaDb`-backed handler table in `data-ipc.ts`. */
export type DataOnlyChannel = Exclude<DataChannel, AiChannel | MediaChannel | SyncChannel>;

export type IpcArgs<C extends DataChannel> = DataIpc[C]["args"];

export type IpcResult<C extends DataChannel> = DataIpc[C]["result"];
