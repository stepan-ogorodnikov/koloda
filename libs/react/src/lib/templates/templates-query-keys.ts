import type { Template } from "@koloda/srs";

export const templatesQueryKeys = {
  all: () => ["templates"] as const,
  detail: (id: Template["id"]) => ["templates", String(id)] as const,
  decks: (id: Template["id"]) => ["template_decks", String(id)] as const,
} as const;
