export const decksQueryKeys = {
  all: () => ["decks"] as const,
  detail: (id: string | number) => ["decks", String(id)] as const,
} as const;
