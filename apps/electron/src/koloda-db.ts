// Hand-written mirror of the NAPI `KolodaDb` class surface
// (`src-rust/src/lib.rs`, JS names = camelCased method names).
//
// Arg/result types come from the `@koloda/native-ipc` contract; the data
// handlers in `data-ipc.ts` call exactly these methods. Every method returns a
// Promise: the addon runs SQLite on its own thread, in call order.
//
// INVARIANT: deliberately NO `getAiProfileSecrets` member. Secrets stay
// main-side: only `ai-ipc.ts` (via its own narrow db type) may load them, and
// no data handler can reach them through this interface. Do not add it here,
// and do not register a renderer `cmd_*` for it.
import type { AddAIProfileData, AIProfile, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import type {
  Conversation,
  CreateSpaceData,
  DeleteConversationData,
  ImportMode,
  IssuedPairing,
  JoinData,
  JoinedSpace,
  PreviewRequest,
  SetConversationData,
  SpacePreview,
  SyncDevice,
  SyncStatus,
} from "@koloda/app";
import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/settings";
import type {
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
import type {
  AddAttachmentWire,
  AttachmentContentWire,
  DbStatus,
  GetLessonsParams,
  SeedDbData,
  SyncEvent,
  SyncStarter,
} from "@koloda/native-ipc";

/** What the engine sends the `syncStart` callback: main logs `error` and forwards the rest as a `SyncEvent`. */
export type SyncEngineEvent = SyncEvent | { type: "error"; message: string };

export interface KolodaDb {
  // Lifecycle
  getDbStatus(): Promise<DbStatus>;
  seedDb(data: SeedDbData): Promise<void>;

  // Cards
  getCards(params: GetCardsParams): Promise<Card[]>;
  getCardCounts(): Promise<Array<{ deckId: string; count: number }>>;
  getCard(params: { id: string }): Promise<Card | null>;
  addCard(data: InsertCardData): Promise<Card>;
  addCards(data: InsertCardData[]): Promise<InsertCardsResponse>;
  updateCard(data: UpdateCardData): Promise<Card>;
  deleteCard(data: DeleteCardData): Promise<void>;
  deleteCards(data: DeleteCardsData): Promise<void>;
  resetCardProgress(data: ResetCardProgressData): Promise<Card>;

  // Presets (algorithms)
  getAlgorithms(): Promise<Algorithm[]>;
  getAlgorithm(params: { id: string }): Promise<Algorithm | null>;
  addAlgorithm(data: InsertAlgorithmData): Promise<Algorithm>;
  cloneAlgorithm(data: CloneAlgorithmData): Promise<Algorithm>;
  updateAlgorithm(data: UpdateAlgorithmData): Promise<Algorithm>;
  deleteAlgorithm(data: DeleteAlgorithmData): Promise<void>;
  getAlgorithmDecks(params: { id: string }): Promise<DeckWithOnlyTitle[]>;

  // Decks
  getDecks(): Promise<Deck[]>;
  getDeck(params: { id: string }): Promise<Deck | null>;
  addDeck(data: InsertDeckData): Promise<Deck>;
  updateDeck(data: UpdateDeckData): Promise<Deck>;
  deleteDeck(data: DeleteDeckData): Promise<void>;

  // Templates
  getTemplates(): Promise<Template[]>;
  getTemplate(params: { id: string }): Promise<Template | null>;
  addTemplate(data: InsertTemplateData): Promise<Template>;
  cloneTemplate(data: CloneTemplateData): Promise<Template>;
  updateTemplate(data: UpdateTemplateData): Promise<Template>;
  deleteTemplate(data: DeleteTemplateData): Promise<void>;
  getTemplateDecks(params: { id: string }): Promise<DeckWithOnlyTitle[]>;

  // Settings
  getSettings(params: { name: SettingsName }): Promise<AllowedSettings<SettingsName> | null>;
  setSettings(params: SetSettingsData<SettingsName>): Promise<AllowedSettings<SettingsName>>;
  patchSettings(params: PatchSettingsData<SettingsName>): Promise<AllowedSettings<SettingsName>>;

  // Conversations
  getConversation(params: { id: string }): Promise<Conversation | null>;
  getConversations(): Promise<Conversation[]>;
  setConversation(params: SetConversationData): Promise<Conversation>;
  deleteConversation(params: DeleteConversationData): Promise<void>;

  // Lessons and reviews
  getLessons(params: GetLessonsParams): Promise<LessonsResult>;
  getLessonData(params: GetLessonDataParams): Promise<LessonData | null>;
  submitLessonResult(data: LessonResultData): Promise<void>;
  getReviews(params: GetReviewsData): Promise<Review[]>;
  getTodaysReviewTotals(): Promise<TodaysReviewTotals>;

  // Attachments (bytes base64-encoded)
  getAttachment(params: { id: string }): Promise<AttachmentContentWire | null>;
  addAttachment(data: AddAttachmentWire): Promise<Attachment>;
  sweepAttachments(data: SweepAttachmentsData): Promise<void>;

  // AI profiles (no secrets — see the INVARIANT above)
  getAiProfiles(): Promise<AIProfile[]>;
  addAiProfile(data: AddAIProfileData): Promise<AIProfile>;
  updateAiProfile(data: UpdateAIProfileData): Promise<AIProfile>;
  removeAiProfile(data: RemoveAIProfileData): Promise<void>;

  // Sync (a worker of its own; host calls wait on the network)
  syncStart(starter: SyncStarter, onEvent: (event: SyncEngineEvent) => void): Promise<SyncStatus>;
  syncStatus(): Promise<SyncStatus>;
  syncNudge(): Promise<void>;
  syncCreateSpace(data: CreateSpaceData): Promise<SyncStatus>;
  syncIssuePairing(): Promise<IssuedPairing>;
  syncDevices(): Promise<SyncDevice[]>;
  syncRevokeDevice(params: { id: string }): Promise<void>;
  syncDetach(): Promise<SyncStatus>;
  syncPreview(data: PreviewRequest): Promise<SpacePreview>;
  syncJoin(data: JoinData & { settings: SeedDbData["settings"] }): Promise<JoinedSpace>;
  syncImport(params: { mode: ImportMode }): Promise<SyncStatus>;
}
