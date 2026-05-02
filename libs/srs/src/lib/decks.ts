import type { Timestamps, UpdateData } from "@koloda/app";
import { z } from "zod";
import { algorithmValidation } from "./algorithms";
import { type Template, templateValidation } from "./templates";

export const deckValidation = z.object({
  id: z.int(),
  title: z
    .string()
    .min(1, "validation.common.title.too-short")
    .max(255, "validation.common.title.too-long"),
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
