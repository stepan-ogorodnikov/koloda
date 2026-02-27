import type { Queries } from "@koloda/react";
import type {
  AddAIProfileData,
  AIProfile,
  Algorithm,
  AllowedSettings,
  CloneAlgorithmData,
  CloneTemplateData,
  Deck,
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
  RemoveAIProfileData,
  ResetCardProgressData,
  Review,
  SetSettingsData,
  SettingsName,
  Template,
  TouchAIProfileData,
  UpdateAlgorithmData,
  UpdateCardData,
  UpdateDeckData,
  UpdateTemplateData,
} from "@koloda/srs";
import type { TodaysReviewTotals } from "@koloda/srs";
import { getAIProfileModels } from "./ai";
import { getStatus, seedDB } from "./setup";
import { invoke } from "./tauri";

export const appQueryOptions = {
  queryKey: ["app"],
  queryFn: getStatus,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
  staleTime: Infinity,
};

export const appSetupMutationOptions = { mutationFn: seedDB };

export const queriesFn = (): Queries => ({
  getSettingsQuery: <T extends SettingsName>(name: T) => ({
    queryFn: () => invoke<AllowedSettings<T>>("cmd_get_settings", { name }),
  }),
  setSettingsMutation: <T extends SettingsName>() => ({
    mutationFn: (data: SetSettingsData<T>) => invoke("cmd_set_settings", data),
  }),
  patchSettingsMutation: <T extends SettingsName>() => ({
    mutationFn: (data: PatchSettingsData<T>) => invoke("cmd_patch_settings", data),
  }),
  getAlgorithmsQuery: () => ({
    queryFn: () => invoke("cmd_get_algorithms"),
  }),
  getAlgorithmQuery: (id: Algorithm["id"]) => ({
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
    queryFn: () => invoke("cmd_get_algorithm_decks", { id }),
  }),
  getDecksQuery: () => ({
    queryFn: () => invoke("cmd_get_decks"),
  }),
  getDeckQuery: (id: Deck["id"]) => ({
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
    queryFn: () => invoke("cmd_get_templates"),
  }),
  getTemplateQuery: (id: Template["id"]) => ({
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
    queryFn: () => invoke("cmd_get_template_decks", data),
  }),
  getCardsQuery: (params: GetCardsParams) => ({
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
  resetCardProgressMutation: () => ({
    mutationFn: (data: ResetCardProgressData) => invoke("cmd_reset_card_progress", { data }),
  }),
  getLessonsQuery: (filters?: LessonFilters) => ({
    queryFn: () => invoke<Lesson[]>("cmd_get_lessons", { params: { dueAt: Date.now(), filters } }),
  }),
  getTodayReviewTotalsQuery: () => ({
    queryFn: () => invoke<TodaysReviewTotals>("cmd_get_todays_review_totals"),
  }),
  getLessonDataQuery: (params: GetLessonDataParams) => ({
    queryFn: () => invoke<LessonData>("cmd_get_lesson_data", { params }),
  }),
  submitLessonResultMutation: () => ({
    mutationFn: (data: LessonResultData) => invoke<Review>("cmd_submit_lesson_result", { data }),
  }),
  getReviewsQuery: (data: GetReviewsData) => ({
    queryFn: () => invoke("cmd_get_reviews", { data }),
  }),
  getAIProfilesQuery: () => ({
    queryFn: () => invoke<AIProfile[]>("cmd_get_ai_profiles"),
  }),
  addAIProfileMutation: () => ({
    mutationFn: (data: AddAIProfileData) => invoke("cmd_add_ai_profile", { data }),
  }),
  removeAIProfileMutation: () => ({
    mutationFn: (data: RemoveAIProfileData) => invoke("cmd_remove_ai_profile", { data }),
  }),
  touchAIProfileMutation: () => ({
    mutationFn: (data: TouchAIProfileData) => invoke("cmd_touch_ai_profile", { data }),
  }),
  getAIProfileModelsQuery: (profileId: string) => ({
    queryFn: () => getAIProfileModels(profileId),
  }),
});
