import type { AddAIProfileData, AIProfile, AIRuntime, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import type {
  AllowedSettings,
  DeleteConversationData,
  PatchSettingsData,
  SetConversationData,
  SetSettingsData,
  SettingsName,
} from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import type {
  Algorithm,
  CloneAlgorithmData,
  CloneTemplateData,
  Deck,
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
  InsertDeckData,
  InsertTemplateData,
  LessonsResult,
  LessonData,
  LessonFilters,
  LessonResultData,
  ResetCardProgressData,
  Review,
  Template,
  TodaysReviewTotals,
  UpdateAlgorithmData,
  UpdateCardData,
  UpdateDeckData,
  UpdateTemplateData,
} from "@koloda/srs";
import { invoke } from "./electron";
import { getStatus, seedDB } from "./setup";

export const appQueryOptions = {
  queryKey: ["app"],
  queryFn: getStatus,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
  staleTime: Infinity,
};

export const appSetupMutationOptions = { mutationFn: seedDB };

export const queriesFn = (aiRuntime: AIRuntime): Queries => ({
  getSettingsQuery: <T extends SettingsName>(name: T) => ({
    queryKey: queryKeys.settings.detail(name),
    queryFn: () => invoke<AllowedSettings<T>>("cmd_get_settings", { name }),
  }),
  setSettingsMutation: <T extends SettingsName>() => ({
    mutationFn: (data: SetSettingsData<T>) => invoke("cmd_set_settings", data),
  }),
  patchSettingsMutation: <T extends SettingsName>() => ({
    mutationFn: (data: PatchSettingsData<T>) => invoke("cmd_patch_settings", data),
  }),
  getConversationQuery: (id: string) => ({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: () => invoke("cmd_get_conversation", { id }),
  }),
  getConversationsQuery: () => ({
    queryKey: queryKeys.conversations.all(),
    queryFn: () => invoke("cmd_get_conversations"),
  }),
  setConversationMutation: () => ({
    mutationFn: (data: SetConversationData) => invoke("cmd_set_conversation", data),
  }),
  deleteConversationMutation: () => ({
    mutationFn: (data: DeleteConversationData) => invoke("cmd_delete_conversation", { id: data.id }),
  }),
  getAlgorithmsQuery: () => ({
    queryKey: queryKeys.algorithms.all(),
    queryFn: () => invoke("cmd_get_algorithms"),
  }),
  getAlgorithmQuery: (id: Algorithm["id"]) => ({
    queryKey: queryKeys.algorithms.detail(id),
    queryFn: () => invoke("cmd_get_algorithm", { id }),
  }),
  addAlgorithmMutation: () => ({
    mutationFn: (data: InsertAlgorithmData) => invoke("cmd_add_algorithm", { data }),
  }),
  cloneAlgorithmMutation: () => ({
    mutationFn: (data: CloneAlgorithmData) => invoke("cmd_clone_algorithm", { data }),
  }),
  updateAlgorithmMutation: () => ({
    mutationFn: (data: UpdateAlgorithmData) => invoke("cmd_update_algorithm", { data }),
  }),
  deleteAlgorithmMutation: () => ({
    mutationFn: (data: DeleteAlgorithmData) => invoke("cmd_delete_algorithm", { data }),
  }),
  getAlgorithmDecksQuery: (id: Algorithm["id"]) => ({
    queryKey: queryKeys.algorithms.decks(id),
    queryFn: () => invoke("cmd_get_algorithm_decks", { id }),
  }),
  getDecksQuery: () => ({
    queryKey: queryKeys.decks.all(),
    queryFn: () => invoke("cmd_get_decks"),
  }),
  getDeckQuery: (id: Deck["id"]) => ({
    queryKey: queryKeys.decks.detail(id),
    queryFn: () => invoke("cmd_get_deck", { id }),
  }),
  addDeckMutation: () => ({
    mutationFn: (data: InsertDeckData) => invoke("cmd_add_deck", { data }),
  }),
  updateDeckMutation: () => ({
    mutationFn: (data: UpdateDeckData) => invoke("cmd_update_deck", { data }),
  }),
  deleteDeckMutation: () => ({
    mutationFn: (data: DeleteDeckData) => invoke("cmd_delete_deck", { data }),
  }),
  getTemplatesQuery: () => ({
    queryKey: queryKeys.templates.all(),
    queryFn: () => invoke("cmd_get_templates"),
  }),
  getTemplateQuery: (id: Template["id"]) => ({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => invoke("cmd_get_template", { id }),
  }),
  addTemplateMutation: () => ({
    mutationFn: (data: InsertTemplateData) => invoke("cmd_add_template", { data }),
  }),
  cloneTemplateMutation: () => ({
    mutationFn: (data: CloneTemplateData) => invoke("cmd_clone_template", { data }),
  }),
  updateTemplateMutation: () => ({
    mutationFn: (data: UpdateTemplateData) => invoke("cmd_update_template", { data }),
  }),
  deleteTemplateMutation: () => ({
    mutationFn: (data: DeleteTemplateData) => invoke("cmd_delete_template", { data }),
  }),
  getTemplateDecksQuery: (data: DeleteDeckData) => ({
    queryKey: queryKeys.templates.decks(data.id),
    queryFn: () => invoke("cmd_get_template_decks", data),
  }),
  getCardsQuery: (params: GetCardsParams) => ({
    queryKey: queryKeys.cards.deck(params),
    queryFn: () => invoke("cmd_get_cards", { params }),
  }),
  addCardMutation: () => ({
    mutationFn: (data: InsertCardData) => invoke("cmd_add_card", { data }),
  }),
  addCardsMutation: () => ({
    mutationFn: (data: InsertCardData[]) => invoke("cmd_add_cards", { data }),
  }),
  updateCardMutation: () => ({
    mutationFn: (data: UpdateCardData) => invoke("cmd_update_card", { data }),
  }),
  deleteCardMutation: () => ({
    mutationFn: (data: DeleteCardData) => invoke("cmd_delete_card", { data }),
  }),
  deleteCardsMutation: () => ({
    mutationFn: (data: DeleteCardsData) => invoke("cmd_delete_cards", { data }),
  }),
  resetCardProgressMutation: () => ({
    mutationFn: (data: ResetCardProgressData) => invoke("cmd_reset_card_progress", { data }),
  }),
  getLessonsQuery: (filters?: LessonFilters) => ({
    queryKey: queryKeys.lessons.all(filters),
    queryFn: () => invoke<LessonsResult>("cmd_get_lessons", { params: { dueAt: Date.now(), filters } }),
  }),
  getTodayReviewTotalsQuery: () => ({
    queryKey: queryKeys.lessons.todayReviewTotals(),
    queryFn: () => invoke<TodaysReviewTotals>("cmd_get_todays_review_totals"),
  }),
  getLessonDataQuery: (params: GetLessonDataParams) => ({
    queryKey: queryKeys.lessons.data(params),
    queryFn: () => invoke<LessonData>("cmd_get_lesson_data", { params }),
  }),
  submitLessonResultMutation: () => ({
    mutationFn: (data: LessonResultData) => invoke<Review>("cmd_submit_lesson_result", { data }),
  }),
  getReviewsQuery: (data: GetReviewsData) => ({
    queryKey: queryKeys.reviews.card(data),
    queryFn: () => invoke("cmd_get_reviews", { data }),
  }),
  getAIProfilesQuery: () => ({
    queryKey: queryKeys.ai.profiles(),
    queryFn: () => invoke<AIProfile[]>("cmd_get_ai_profiles"),
  }),
  addAIProfileMutation: () => ({
    mutationFn: (data: AddAIProfileData) => invoke("cmd_add_ai_profile", { data }),
  }),
  updateAIProfileMutation: () => ({
    mutationFn: (data: UpdateAIProfileData) => invoke("cmd_update_ai_profile", { data }),
  }),
  removeAIProfileMutation: () => ({
    mutationFn: (data: RemoveAIProfileData) => invoke("cmd_remove_ai_profile", { data }),
  }),
  getAIProfileModelsQuery: (profileId: string) => ({
    queryKey: queryKeys.ai.models(profileId),
    queryFn: () => aiRuntime.listModels(profileId),
  }),
});
