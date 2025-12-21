export const cardQueryKeys = {
  all: (params?: { deckId?: string | number }) => {
    if (params?.deckId) {
      return ["cards", String(params.deckId)] as const;
    }
    return ["cards"] as const;
  },
  detail: (id: string | number) => ["cards", String(id)] as const,
} as const;
