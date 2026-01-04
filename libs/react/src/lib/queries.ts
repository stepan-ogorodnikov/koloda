import type {
  Algorithm,
  AllowedSettings,
  Card,
  CloneAlgorithmData,
  CloneTemplateData,
  Deck,
  DeckWithOnlyTitle,
  DeleteAlgorithmData,
  DeleteCardData,
  DeleteDeckData,
  DeleteTemplateData,
  GetCardsCountParams,
  GetCardsParams,
  GetLessonDataParams,
  GetReviewsData,
  InsertAlgorithmData,
  InsertCardData,
  InsertDeckData,
  InsertReviewData,
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
  getSettingsQuery: <T extends SettingsName>(name: T) => QueryOptions<AllowedSettings<T> | undefined>;
  setSettingsMutation: <T extends SettingsName>() => UseMutationOptions<
    AllowedSettings<T> | undefined,
    Error,
    SetSettingsData<T>,
    unknown
  >;
  patchSettingsMutation: <T extends SettingsName>() => UseMutationOptions<
    AllowedSettings<T> | undefined,
    Error,
    PatchSettingsData<T>,
    unknown
  >;
  getAlgorithmsQuery: () => QueryOptions<Algorithm[]>;
  getAlgorithmQuery: (id: string) => QueryOptions<Algorithm | null | undefined>;
  addAlgorithmMutation: () => UseMutationOptions<Algorithm | undefined, Error, InsertAlgorithmData, unknown>;
  cloneAlgorithmMutation: () => UseMutationOptions<Algorithm | undefined, Error, CloneAlgorithmData, unknown>;
  updateAlgorithmMutation: () => UseMutationOptions<Algorithm | undefined, Error, UpdateAlgorithmData, unknown>;
  deleteAlgorithmMutation: () => UseMutationOptions<unknown, Error, DeleteAlgorithmData, unknown>;
  getAlgorithmDecksQuery: (id: string) => QueryOptions<DeckWithOnlyTitle[] | undefined>;
  getDecksQuery: () => QueryOptions<Deck[] | undefined>;
  getDeckQuery: (id: string) => QueryOptions<Deck | null | undefined>;
  addDeckMutation: () => UseMutationOptions<Deck | undefined, Error, InsertDeckData, unknown>;
  updateDeckMutation: () => UseMutationOptions<Deck | undefined, Error, UpdateDeckData, unknown>;
  deleteDeckMutation: () => UseMutationOptions<unknown, Error, DeleteDeckData, unknown>;
  getTemplatesQuery: () => QueryOptions<Template[]>;
  getTemplateQuery: (id: Template["id"] | string) => QueryOptions<Template | null | undefined>;
  addTemplateMutation: () => UseMutationOptions<Template | undefined, Error, InsertTemplateData, unknown>;
  cloneTemplateMutation: () => UseMutationOptions<Template | undefined, Error, CloneTemplateData, unknown>;
  updateTemplateMutation: () => UseMutationOptions<Template | undefined, Error, UpdateTemplateData, unknown>;
  deleteTemplateMutation: () => UseMutationOptions<unknown, Error, DeleteTemplateData, unknown>;
  getTemplateDecksQuery: (data: DeleteDeckData) => QueryOptions<DeckWithOnlyTitle[] | undefined>;
  getCardsQuery: (params: GetCardsParams) => QueryOptions<Card[]>;
  getCardsCountQuery: (params: GetCardsCountParams) => QueryOptions<number>;
  addCardMutation: () => UseMutationOptions<Card | undefined, Error, InsertCardData, unknown>;
  updateCardMutation: () => UseMutationOptions<Card | undefined, Error, UpdateCardData, unknown>;
  deleteCardMutation: () => UseMutationOptions<unknown, Error, DeleteCardData, unknown>;
  resetCardProgressMutation: () => UseMutationOptions<unknown, Error, ResetCardProgressData, unknown>;
  getLessonsQuery: (filters?: LessonFilters) => QueryOptions<Lesson[] | undefined>;
  getTodayReviewTotalsQuery: () => QueryOptions<TodaysReviewTotals | undefined>;
  getLessonDataQuery: (params: GetLessonDataParams) => QueryOptions<LessonData | null>;
  submitLessonResultMutation: () => UseMutationOptions<Review | undefined, Error, LessonResultData, unknown>;
  getReviewsQuery: (data: GetReviewsData) => QueryOptions<Review[] | undefined>;
  addReviewMutation: () => UseMutationOptions<Review | undefined, Error, InsertReviewData, unknown>;
};

export const queriesAtom = atom<Queries>(null!);
