import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod/v4";
import { algorithmValidation } from "./algorithms";
import type { Timestamps } from "./db";
import { type Template, templateValidation } from "./templates";
import type { UpdateData } from "./utility";

export const decksMessages: Record<string, MessageDescriptor> = {
  "title.min-length": msg`title.min-length`,
  "title.max-length": msg`title.max-length`,
};

export const deckValidation = z.object({
  id: z.int(),
  title: z
    .string()
    .min(1, "title.min-length")
    .max(255, "title.max-length"),
  algorithmId: algorithmValidation.shape.id,
  templateId: templateValidation.shape.id,
});

export type Deck = z.infer<typeof deckValidation> & Timestamps;

export type DeckWithTemplate = Deck & { template: Template };

export type DeckWithOnlyTitle = Pick<Deck, "id" | "title">;

export const insertDeckSchema = deckValidation.omit({ id: true });

export type InsertDeckData = z.infer<typeof insertDeckSchema>;

export const updateDeckSchema = deckValidation.omit({ id: true });

export type UpdateDeckValues = z.input<typeof updateDeckSchema>;

export type UpdateDeckData = UpdateData<Deck, "id", UpdateDeckValues>;

export type DeleteDeckData = Pick<Deck, "id">;
