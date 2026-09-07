import type { AddAIProfileData, AIRuntime, RemoveAIProfileData, UpdateAIProfileData } from "@koloda/ai";
import type { ConversationListItem, DeleteConversationData, SetConversationData } from "@koloda/app";
import type { AllowedSettings, PatchSettingsData, SetSettingsData, SettingsName } from "@koloda/settings";
import { toConversationListItem } from "@koloda/app";
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
  LessonFilters,
  LessonResultData,
  ResetCardProgressData,
  Template,
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
    // WHY: the contract types the result per channel (`AllowedSettings<SettingsName>`);
    // `Queries` narrows it to the requested `T`, so the adapter asserts here.
    queryFn: async () => (await invoke("cmd_get_settings", { name })) as AllowedSettings<T> | null,
  }),
  setSettingsMutation: <T extends SettingsName>() => ({
    mutationFn: async (data: SetSettingsData<T>) => (await invoke("cmd_set_settings", data)) as AllowedSettings<T>,
  }),
  patchSettingsMutation: <T extends SettingsName>() => ({
    mutationFn: async (data: PatchSettingsData<T>) => (await invoke("cmd_patch_settings", data)) as AllowedSettings<T>,
  }),
  getConversationQuery: (id: string) => ({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: () => invoke("cmd_get_conversation", { id }),
  }),
  getConversationsQuery: () => ({
    queryKey: queryKeys.conversations.all(),
    queryFn: async (): Promise<ConversationListItem[]> => {
      // INVARIANT: hasTurns is derived here from opaque `state`. Do not parse state in Rust.
      const rows = await invoke("cmd_get_conversations", undefined);
      return rows.map(toConversationListItem);
    },
  }),
  setConversationMutation: () => ({
    mutationFn: (data: SetConversationData) => invoke("cmd_set_conversation", data),
  }),
  deleteConversationMutation: () => ({
    mutationFn: (data: DeleteConversationData) => invoke("cmd_delete_conversation", { id: data.id }),
  }),
  getAlgorithmsQuery: () => ({
    queryKey: queryKeys.algorithms.all(),
    queryFn: () => invoke("cmd_get_algorithms", undefined),
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
    queryFn: () => invoke("cmd_get_decks", undefined),
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
    queryFn: () => invoke("cmd_get_templates", undefined),
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
    queryFn: () => invoke("cmd_get_lessons", { params: { dueAt: Date.now(), filters } }),
  }),
  getTodayReviewTotalsQuery: () => ({
    queryKey: queryKeys.lessons.todayReviewTotals(),
    queryFn: () => invoke("cmd_get_todays_review_totals", undefined),
  }),
  getLessonDataQuery: (params: GetLessonDataParams) => ({
    queryKey: queryKeys.lessons.data(params),
    queryFn: () => invoke("cmd_get_lesson_data", { params }),
  }),
  submitLessonResultMutation: () => ({
    // WHY: Rust replies `Result<()>` (contract `void`); `Queries` keeps
    // `Review | undefined`, so the adapter adapts instead of promising a Review.
    mutationFn: async (data: LessonResultData) => {
      await invoke("cmd_submit_lesson_result", { data });
      return undefined;
    },
  }),
  getReviewsQuery: (data: GetReviewsData) => ({
    queryKey: queryKeys.reviews.card(data),
    queryFn: () => invoke("cmd_get_reviews", { data }),
  }),
  getAIProfilesQuery: () => ({
    queryKey: queryKeys.ai.profiles(),
    queryFn: () => invoke("cmd_get_ai_profiles", undefined),
  }),
  addAIProfileMutation: () => ({
    // WHY: the contract returns the stored AIProfile, but `Queries` declares
    // `void` (no consumer reads the value) — the adapter drops it.
    mutationFn: async (data: AddAIProfileData) => {
      await invoke("cmd_add_ai_profile", { data });
    },
  }),
  updateAIProfileMutation: () => ({
    mutationFn: async (data: UpdateAIProfileData) => {
      await invoke("cmd_update_ai_profile", { data });
    },
  }),
  removeAIProfileMutation: () => ({
    mutationFn: (data: RemoveAIProfileData) => invoke("cmd_remove_ai_profile", { data }),
  }),
  getAIProfileModelsQuery: (profileId: string) => ({
    queryKey: queryKeys.ai.models(profileId),
    queryFn: () => aiRuntime.listModels(profileId),
  }),
});
