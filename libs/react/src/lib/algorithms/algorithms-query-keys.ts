import type { Algorithm } from "@koloda/srs";

export const algorithmsQueryKeys = {
  all: () => ["algorithms"] as const,
  detail: (id: Algorithm["id"]) => ["algorithms", String(id)] as const,
  decks: (id: Algorithm["id"]) => ["algorithm_decks", String(id)] as const,
} as const;
