import { DEFAULT_LEARNING_SETTINGS, toConversationListItem } from "@koloda/app";
import { queryKeys } from "@koloda/core-react";
import type { Queries } from "@koloda/core-react";
import { calculateTodaysReviewTotals } from "@koloda/srs";
import type { LessonFilters, LessonsResult } from "@koloda/srs";
import { SAMPLE_ALGORITHM } from "./algorithm-samples";
import { SAMPLE_AI_PROFILE, SAMPLE_CONVERSATIONS } from "./assistant-samples";
import { SAMPLE_TEMPLATE } from "./template-samples";

// WHY: `total` is a placeholder; `calculateTodaysReviewTotals` recomputes it from the counted buckets.
const SAMPLE_REVIEW_TOTALS = { untouched: 18, learn: 34, review: 92, total: 0 };

const SAMPLE_LESSON_DECKS = [
  { id: "0199a1b0-0000-7000-8000-000000000001", title: "Japanese vocabulary N5", untouched: 20, learn: 4, review: 37 },
  { id: "0199a1b0-0000-7000-8000-000000000002", title: "Spanish irregular verbs", untouched: 0, learn: 2, review: 15 },
  { id: "0199a1b0-0000-7000-8000-000000000003", title: "World capitals", untouched: 12, learn: 0, review: 0 },
  {
    id: "0199a1b0-0000-7000-8000-000000000004",
    title: "Organic chemistry reactions and mechanisms for the final exam",
    untouched: 35,
    learn: 7,
    review: 64,
  },
  { id: "0199a1b0-0000-7000-8000-000000000005", title: "Rust ownership", untouched: 5, learn: 1, review: 8 },
  { id: "0199a1b0-0000-7000-8000-000000000006", title: "Music theory", untouched: 0, learn: 0, review: 0 },
];

// WHY: shaped like `getLessons` in `@koloda/db-sqlite`, so a lesson opened from one deck counts only that deck.
// A deck's total is its three buckets, and the summary row adds up the decks.
function sampleLessons(filters?: LessonFilters): LessonsResult {
  const decks = SAMPLE_LESSON_DECKS.filter(({ id }) => !filters?.deckIds?.length || filters.deckIds.includes(id)).map(
    (deck) => ({ ...deck, total: deck.untouched + deck.learn + deck.review }),
  );
  const total = decks.reduce(
    (sum, deck) => ({
      untouched: sum.untouched + deck.untouched,
      learn: sum.learn + deck.learn,
      review: sum.review + deck.review,
      total: sum.total + deck.total,
    }),
    { untouched: 0, learn: 0, review: 0, total: 0 },
  );
  return { total, decks };
}

// WHY: a save replaces the sample in memory, because the editors refetch right after saving.
// Edits last until a reload.
let sampleAlgorithm = SAMPLE_ALGORITHM;
let sampleTemplate = SAMPLE_TEMPLATE;

const stubs: Pick<
  Queries,
  | "getSettingsQuery"
  | "getTodayReviewTotalsQuery"
  | "getLessonsQuery"
  | "getConversationsQuery"
  | "getConversationQuery"
  | "setConversationMutation"
  | "getAIProfilesQuery"
  | "getAlgorithmsQuery"
  | "getAlgorithmQuery"
  | "updateAlgorithmMutation"
  | "getTemplatesQuery"
  | "getTemplateQuery"
  | "updateTemplateMutation"
> = {
  getSettingsQuery: (name) => ({
    queryKey: queryKeys.settings.detail(name),
    queryFn: () => null,
  }),
  getTodayReviewTotalsQuery: () => ({
    queryKey: queryKeys.lessons.todayReviewTotals(),
    queryFn: () => calculateTodaysReviewTotals(DEFAULT_LEARNING_SETTINGS, SAMPLE_REVIEW_TOTALS),
  }),
  getLessonsQuery: (filters) => ({
    queryKey: queryKeys.lessons.all(filters),
    queryFn: () => sampleLessons(filters),
  }),
  getConversationsQuery: () => ({
    queryKey: queryKeys.conversations.all(),
    queryFn: () => SAMPLE_CONVERSATIONS.map(toConversationListItem),
  }),
  getConversationQuery: (id) => ({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: () => SAMPLE_CONVERSATIONS.find((conversation) => conversation.id === id) ?? null,
  }),
  // WHY: the assistant saves every opened conversation. Answering with the row, without storing it,
  // lets its save queue settle; edits last until the conversation reloads from the samples.
  setConversationMutation: () => ({
    mutationFn: async ({ id, title, state, updatedAt }) => ({
      id,
      title: title ?? null,
      state,
      createdAt: SAMPLE_CONVERSATIONS.find((conversation) => conversation.id === id)?.createdAt ?? new Date(),
      updatedAt: updatedAt ?? new Date(),
    }),
  }),
  getAIProfilesQuery: () => ({
    queryKey: queryKeys.ai.profiles(),
    queryFn: () => [SAMPLE_AI_PROFILE],
  }),
  getAlgorithmsQuery: () => ({
    queryKey: queryKeys.algorithms.all(),
    queryFn: () => [sampleAlgorithm],
  }),
  getAlgorithmQuery: (id) => ({
    queryKey: queryKeys.algorithms.detail(id),
    queryFn: () => (id === sampleAlgorithm.id ? sampleAlgorithm : null),
  }),
  updateAlgorithmMutation: () => ({
    mutationFn: async ({ values }) => {
      sampleAlgorithm = { ...sampleAlgorithm, ...values, updatedAt: new Date() };
      return sampleAlgorithm;
    },
  }),
  getTemplatesQuery: () => ({
    queryKey: queryKeys.templates.all(),
    queryFn: () => [sampleTemplate],
  }),
  getTemplateQuery: (id) => ({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => (id === sampleTemplate.id ? sampleTemplate : null),
  }),
  updateTemplateMutation: () => ({
    mutationFn: async ({ values }) => {
      sampleTemplate = { ...sampleTemplate, ...values, updatedAt: new Date() };
      return sampleTemplate;
    },
  }),
};

// WHY: the app has no database. A null settings row makes `useHotkeysSettings` fall back to the defaults;
// lessons, today's totals, conversations, AI profiles, algorithms, and templates are sample data.
// Every other query or mutation rejects with its name when it runs, not when it is built:
// `useLessonSession` builds a disabled lesson-data query on every render.
// Only `*Query` and `*Mutation` keys become methods, because jotai probes a stored value for `then`.
export const queries = new Proxy(stubs as Queries, {
  get(target, key) {
    if (key in target) return Reflect.get(target, key);
    if (typeof key !== "string") return undefined;
    const fail = () => Promise.reject(new Error(`The design system app has no data for ${key}`));
    if (key.endsWith("Query")) return (...args: unknown[]) => ({ queryKey: [key, ...args], queryFn: fail });
    if (key.endsWith("Mutation")) return () => ({ mutationFn: fail });
    return undefined;
  },
});
