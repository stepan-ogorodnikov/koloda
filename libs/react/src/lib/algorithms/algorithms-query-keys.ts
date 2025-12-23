export const algorithmsQueryKeys = {
  all: () => ["algorithms"] as const,
  detail: (id: string | number) => ["algorithms", String(id)] as const,
  decks: (id: string | number) => ["algorithm_decks", String(id)] as const,
} as const;
