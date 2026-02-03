import type { Deck } from "@koloda/srs";

export const decksQueryKeys = {
  all: () => ["decks"] as const,
  detail: (id: Deck["id"]) => ["decks", String(id)] as const,
} as const;
