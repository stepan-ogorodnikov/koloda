import type {
  Algorithm,
  AllowedSettings,
  AppError,
  Card,
  CloneAlgorithmData,
  CloneTemplateData,
  Deck,
  DeckWithOnlyTitle,
  DeleteAlgorithmData,
  DeleteCardData,
  DeleteDeckData,
  DeleteTemplateData,
  GetCardsParams,
  GetLessonDataParams,
  GetReviewsData,
  InsertAlgorithmData,
  InsertCardData,
  InsertDeckData,
  InsertTemplateData,
  Lesson,
  LessonData,
  LessonFilters,
  LessonResultData,
  PatchSettingsData,
  ResetCardProgressData,
  Review,
  SetSettingsData,
  SettingsName,
  Template,
  TodaysReviewTotals,
  UpdateAlgorithmData,
  UpdateCardData,
  UpdateDeckData,
  UpdateTemplateData,
} from "@koloda/srs";
import type { UseMutationOptions } from "@tanstack/react-query";
import { type QueryOptions } from "@tanstack/react-query";
import { atom } from "jotai";

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
  updateCardMutation: () => UseMutationOptions<Card | undefined, AppError, UpdateCardData, unknown>;
  deleteCardMutation: () => UseMutationOptions<unknown, AppError, DeleteCardData, unknown>;
  resetCardProgressMutation: () => UseMutationOptions<unknown, AppError, ResetCardProgressData, unknown>;
  getLessonsQuery: (filters?: LessonFilters) => QueryOptions<Lesson[] | undefined>;
  getTodayReviewTotalsQuery: () => QueryOptions<TodaysReviewTotals | undefined>;
  getLessonDataQuery: (params: GetLessonDataParams) => QueryOptions<LessonData | null>;
  submitLessonResultMutation: () => UseMutationOptions<Review | undefined, AppError, LessonResultData, unknown>;
  getReviewsQuery: (data: GetReviewsData) => QueryOptions<Review[] | undefined>;
};

export const queriesAtom = atom<Queries>(null!);
