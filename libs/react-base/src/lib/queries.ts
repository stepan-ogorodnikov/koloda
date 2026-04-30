import type {
  AddAIProfileData,
  AIModel,
  AIProfile,
  Algorithm,
  AllowedSettings,
  AppError,
  Card,
  ChatStreamRequest,
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
  GenerateCardsInput,
  GeneratedCard,
  InsertAlgorithmData,
  InsertCardData,
  InsertCardsResponse,
  InsertDeckData,
  InsertTemplateData,
  Lesson,
  LessonData,
  LessonFilters,
  LessonResultData,
  PatchSettingsData,
  RemoveAIProfileData,
  ResetCardProgressData,
  Review,
  SetSettingsData,
  SettingsName,
  Template,
  TodaysReviewTotals,
  TouchAIProfileData,
  UpdateAIProfileData,
  UpdateAlgorithmData,
  UpdateCardData,
  UpdateDeckData,
  UpdateTemplateData,
} from "@koloda/srs";
import type { UseMutationOptions } from "@tanstack/react-query";
import { type QueryOptions } from "@tanstack/react-query";
import type { ModelMessage } from "ai";
import { atom } from "jotai";

export type AIRuntimeGenerateCardsRequest = {
  input: GenerateCardsInput;
  messages: ModelMessage[];
  template: Template;
  systemPromptTemplate?: string;
};

export type AIRuntime = {
  generateCards?: (
    request: AIRuntimeGenerateCardsRequest,
    onCard: (card: GeneratedCard) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  chat?: (
    request: ChatStreamRequest,
    onChunk: (chunk: string) => void,
    signal: AbortSignal,
  ) => Promise<void>;
};

export type Queries = {
  getSettingsQuery: <T extends SettingsName>(name: T) => QueryOptions<AllowedSettings<T> | null>;
  setSettingsMutation: <T extends SettingsName>() => UseMutationOptions<
    AllowedSettings<T> | undefined,
    AppError,
    SetSettingsData<T>,
    unknown
  >;
  patchSettingsMutation: <T extends SettingsName>() => UseMutationOptions<
    AllowedSettings<T> | undefined,
    AppError,
    PatchSettingsData<T>,
    unknown
  >;
  getAlgorithmsQuery: () => QueryOptions<Algorithm[]>;
  getAlgorithmQuery: (id: Algorithm["id"]) => QueryOptions<Algorithm | null | undefined>;
  addAlgorithmMutation: () => UseMutationOptions<Algorithm | undefined, AppError, InsertAlgorithmData, unknown>;
  cloneAlgorithmMutation: () => UseMutationOptions<Algorithm | undefined, AppError, CloneAlgorithmData, unknown>;
  updateAlgorithmMutation: () => UseMutationOptions<Algorithm | undefined, AppError, UpdateAlgorithmData, unknown>;
  deleteAlgorithmMutation: () => UseMutationOptions<unknown, AppError, DeleteAlgorithmData, unknown>;
  getAlgorithmDecksQuery: (id: Algorithm["id"]) => QueryOptions<DeckWithOnlyTitle[] | undefined>;
  getDecksQuery: () => QueryOptions<Deck[] | undefined>;
  getDeckQuery: (id: Deck["id"]) => QueryOptions<Deck | null | undefined>;
  addDeckMutation: () => UseMutationOptions<Deck | undefined, AppError, InsertDeckData, unknown>;
  updateDeckMutation: () => UseMutationOptions<Deck | undefined, AppError, UpdateDeckData, unknown>;
  deleteDeckMutation: () => UseMutationOptions<unknown, AppError, DeleteDeckData, unknown>;
  getTemplatesQuery: () => QueryOptions<Template[]>;
  getTemplateQuery: (id: Template["id"]) => QueryOptions<Template | null | undefined>;
  addTemplateMutation: () => UseMutationOptions<Template | undefined, AppError, InsertTemplateData, unknown>;
  cloneTemplateMutation: () => UseMutationOptions<Template | undefined, AppError, CloneTemplateData, unknown>;
  updateTemplateMutation: () => UseMutationOptions<Template | undefined, AppError, UpdateTemplateData, unknown>;
  deleteTemplateMutation: () => UseMutationOptions<unknown, AppError, DeleteTemplateData, unknown>;
  getTemplateDecksQuery: (data: DeleteDeckData) => QueryOptions<DeckWithOnlyTitle[] | undefined>;
  getCardsQuery: (params: GetCardsParams) => QueryOptions<Card[]>;
  addCardMutation: () => UseMutationOptions<Card | undefined, AppError, InsertCardData, unknown>;
  addCardsMutation: () => UseMutationOptions<InsertCardsResponse, AppError, InsertCardData[], unknown>;
  updateCardMutation: () => UseMutationOptions<Card | undefined, AppError, UpdateCardData, unknown>;
  deleteCardMutation: () => UseMutationOptions<unknown, AppError, DeleteCardData, unknown>;
  deleteCardsMutation: () => UseMutationOptions<unknown, AppError, DeleteCardsData, unknown>;
  resetCardProgressMutation: () => UseMutationOptions<unknown, AppError, ResetCardProgressData, unknown>;
  getLessonsQuery: (filters?: LessonFilters) => QueryOptions<Lesson[] | undefined>;
  getTodayReviewTotalsQuery: () => QueryOptions<TodaysReviewTotals | undefined>;
  getLessonDataQuery: (params: GetLessonDataParams) => QueryOptions<LessonData | null>;
  submitLessonResultMutation: () => UseMutationOptions<Review | undefined, AppError, LessonResultData, unknown>;
  getReviewsQuery: (data: GetReviewsData) => QueryOptions<Review[] | undefined>;
  addAIProfileMutation: () => UseMutationOptions<void, AppError, AddAIProfileData, unknown>;
  updateAIProfileMutation: () => UseMutationOptions<void, AppError, UpdateAIProfileData, unknown>;
  removeAIProfileMutation: () => UseMutationOptions<void, AppError, RemoveAIProfileData, unknown>;
  touchAIProfileMutation: () => UseMutationOptions<void, AppError, TouchAIProfileData, unknown>;
  getAIProfileModelsQuery: (profileId: string) => QueryOptions<AIModel[]>;
  getAIProfilesQuery: () => QueryOptions<AIProfile[]>;
  aiRuntime?: AIRuntime;
};

export const queriesAtom = atom<Queries>(null!);
