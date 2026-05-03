import type {
  Algorithm,
  Deck,
  GetCardsParams,
  GetLessonDataParams,
  GetReviewsData,
  LessonFilters,
  SettingsName,
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
  },
  cards: {
    deck: ({ deckId }: GetCardsParams) => ["cards", String(deckId)] as const,
    detail: (id: Deck["id"]) => ["cards", String(id)] as const,
  },
  decks: {
    all: () => ["decks"] as const,
    detail: (id: Deck["id"]) => ["decks", String(id)] as const,
  },
  lessons: {
    all: (filters?: LessonFilters) => ["lessons", { filters }] as const,
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
  },
} as const;
