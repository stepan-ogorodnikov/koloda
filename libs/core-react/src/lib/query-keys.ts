import type { SettingsName } from "@koloda/app";
import type {
  Algorithm,
  Deck,
  GetCardsParams,
  GetLessonDataParams,
  GetReviewsData,
  LessonFilters,
  Template,
} from "@koloda/srs";

export const queryKeys = {
  ai: {
    profiles: () => ["ai", "profiles"] as const,
    models: (credentialId: string) => ["ai", "models", credentialId] as const,
  },
  algorithms: {
    all: () => ["algorithms"] as const,
    detail: (id: Algorithm["id"]) => ["algorithms", String(id)] as const,
    decks: (id: Algorithm["id"]) => ["algorithm_decks", String(id)] as const,
    // WHY: deck mutations change which decks reference any algorithm; invalidate
    // every per-algorithm deck list via this prefix.
    decksAll: () => ["algorithm_decks"] as const,
  },
  cards: {
    all: () => ["cards"] as const,
    deck: ({ deckId }: GetCardsParams) => ["cards", String(deckId)] as const,
    detail: (id: Deck["id"]) => ["cards", String(id)] as const,
  },
  conversations: {
    all: () => ["conversations"] as const,
    detail: (id: string) => ["conversations", id] as const,
  },
  decks: {
    all: () => ["decks"] as const,
    detail: (id: Deck["id"]) => ["decks", String(id)] as const,
  },
  lessons: {
    // WHY: normalize missing filters to {} so invalidations like all() and all({})
    // match queries created without arguments; otherwise staleTime keeps serving
    // cached lesson lists that invalidations never reach.
    all: (filters?: LessonFilters) => ["lessons", { filters: filters ?? {} }] as const,
    data: (params: GetLessonDataParams) => ["lesson_data", params] as const,
    todayReviewTotals: () => ["today_review_totals"] as const,
  },
  settings: {
    all: () => ["settings"] as const,
    detail: (name: SettingsName) => ["settings", name] as const,
  },
  reviews: {
    card: (data: GetReviewsData) => ["reviews", String(data.cardId)] as const,
  },
  templates: {
    all: () => ["templates"] as const,
    detail: (id: Template["id"]) => ["templates", String(id)] as const,
    decks: (id: Template["id"]) => ["template_decks", String(id)] as const,
    // WHY: deck mutations change which decks reference any template; invalidate
    // every per-template deck list via this prefix.
    decksAll: () => ["template_decks"] as const,
  },
} as const;
