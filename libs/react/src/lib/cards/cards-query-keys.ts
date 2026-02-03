import type { Deck, GetCardsCountParams, GetCardsParams } from "@koloda/srs";

export const cardsQueryKeys = {
  deck: ({ deckId }: GetCardsParams) => (
    ["cards", String(deckId)] as const
  ),
  count: ({ deckId }: GetCardsCountParams) => (
    ["cards_count", String(deckId)] as const
  ),
  detail: (id: Deck["id"]) => ["cards", String(id)] as const,
} as const;
