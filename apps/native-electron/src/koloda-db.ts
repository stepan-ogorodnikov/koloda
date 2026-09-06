// Hand-written mirror of the NAPI `KolodaDb` class surface
// (`src-rust/src/lib.rs`, JS names = camelCased method names).
//
// Arg/result types come from the `@koloda/native-ipc` contract; the data
// handlers in `data-ipc.ts` call exactly these methods.
//
// INVARIANT: deliberately NO `getAiProfileSecrets` member. Secrets stay
// main-side: only `ai-ipc.ts` (via its own narrow db type) may load them, and
// no data handler can reach them through this interface. Do not add it here,
// and do not register a renderer `cmd_*` for it.
import type { AddAIProfileData, AIProfile, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import type {
  AllowedSettings,
  Conversation,
  DeleteConversationData,
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
import type { DbStatus, GetLessonsParams, ReviewTotals, ReviewTotalsParams, SeedDbData } from "@koloda/native-ipc";

export interface KolodaDb {
  // Lifecycle
  getDbStatus(): DbStatus;
  seedDb(data: SeedDbData): void;

  // Cards
  getCards(params: GetCardsParams): Card[];
  getCardCounts(): Array<{ deckId: number; count: number }>;
  getCard(params: { id: number }): Card | null;
  addCard(data: InsertCardData): Card;
  addCards(data: InsertCardData[]): InsertCardsResponse;
  updateCard(data: UpdateCardData): Card;
  deleteCard(data: DeleteCardData): void;
  deleteCards(data: DeleteCardsData): void;
  resetCardProgress(data: ResetCardProgressData): Card;

  // Presets (algorithms)
  getAlgorithms(): Algorithm[];
  getAlgorithm(params: { id: number }): Algorithm | null;
  addAlgorithm(data: InsertAlgorithmData): Algorithm;
  cloneAlgorithm(data: CloneAlgorithmData): Algorithm;
  updateAlgorithm(data: UpdateAlgorithmData): Algorithm;
  deleteAlgorithm(data: DeleteAlgorithmData): void;
  getAlgorithmDecks(params: { id: number }): DeckWithOnlyTitle[];

  // Decks
  getDecks(): Deck[];
  getDeck(params: { id: number }): Deck | null;
  addDeck(data: InsertDeckData): Deck;
  updateDeck(data: UpdateDeckData): Deck;
  deleteDeck(data: DeleteDeckData): void;

  // Templates
  getTemplates(): Template[];
  getTemplate(params: { id: number }): Template | null;
  addTemplate(data: InsertTemplateData): Template;
  cloneTemplate(data: CloneTemplateData): Template;
  updateTemplate(data: UpdateTemplateData): Template;
  deleteTemplate(data: DeleteTemplateData): void;
  getTemplateDecks(params: { id: number }): DeckWithOnlyTitle[];

  // Settings
  getSettings(params: { name: SettingsName }): AllowedSettings<SettingsName> | null;
  setSettings(params: SetSettingsData<SettingsName>): AllowedSettings<SettingsName>;
  patchSettings(params: PatchSettingsData<SettingsName>): AllowedSettings<SettingsName>;

  // Conversations
  getConversation(params: { id: string }): Conversation | null;
  getConversations(): Conversation[];
  setConversation(params: SetConversationData): Conversation;
  deleteConversation(params: DeleteConversationData): void;

  // Lessons and reviews
  getLessons(params: GetLessonsParams): LessonsResult;
  getLessonData(params: GetLessonDataParams): LessonData | null;
  submitLessonResult(data: LessonResultData): void;
  getReviews(data: GetReviewsData): Review[];
  getReviewTotals(data: ReviewTotalsParams): ReviewTotals;
  getTodaysReviewTotals(): TodaysReviewTotals;

  // AI profiles (no secrets — see the INVARIANT above)
  getAiProfiles(): AIProfile[];
  addAiProfile(data: AddAIProfileData): AIProfile;
  updateAiProfile(data: UpdateAIProfileData): AIProfile;
  removeAiProfile(data: RemoveAIProfileData): void;
}
