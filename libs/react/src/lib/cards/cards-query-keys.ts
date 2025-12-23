import type { GetCardsCountParams, GetCardsParams } from "@koloda/srs";

export const cardsQueryKeys = {
  deck: ({ deckId }: GetCardsParams) => (
    ["cards", String(deckId)] as const
  ),
  paginated: (params: GetCardsParams) => (
    [
      ...cardsQueryKeys.deck(params),
      { page: String(params.page || 0), pageSize: String(params.pageSize || 0) },
    ] as const
  ),
  count: ({ deckId }: GetCardsCountParams) => (
    ["cards_count", String(deckId)] as const
  ),
  detail: (id: string | number) => ["cards", String(id)] as const,
} as const;
