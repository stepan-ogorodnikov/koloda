import type { Deck, GetCardsParams } from "@koloda/srs";

export const cardsQueryKeys = {
  deck: ({ deckId }: GetCardsParams) => (
    ["cards", String(deckId)] as const
  ),
  detail: (id: Deck["id"]) => ["cards", String(id)] as const,
} as const;
