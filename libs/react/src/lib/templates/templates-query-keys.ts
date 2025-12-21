export const templateQueryKeys = {
  all: () => ["templates"] as const,
  detail: (id: string | number) => ["templates", String(id)] as const,
  decks: (id: string | number) => ["template_decks", String(id)] as const,
} as const;
