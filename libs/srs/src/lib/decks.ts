import type { UpdateData } from "@koloda/app";
import { timestampsValidation } from "@koloda/app";
import { z } from "zod";
import { optionalEntityNotesSchema, requiredEntityTitleSchema } from "@koloda/app";

export const deckValidation = z.object({
  id: z.uuid(),
  title: requiredEntityTitleSchema,
  notes: optionalEntityNotesSchema,
  algorithmId: z.uuid({ message: "validation.decks.algorithm" }),
  templateId: z.uuid({ message: "validation.decks.template" }),
});

export const deckRowSchema = deckValidation.extend(timestampsValidation.shape);

export type Deck = z.infer<typeof deckRowSchema>;

export const deckWithOnlyTitleSchema = deckValidation.pick({ id: true, title: true });

export type DeckWithOnlyTitle = z.infer<typeof deckWithOnlyTitleSchema>;

export const insertDeckSchema = deckValidation.omit({ id: true });

export type InsertDeckData = z.infer<typeof insertDeckSchema>;

export const updateDeckSchema = deckValidation.omit({ id: true });

export type UpdateDeckValues = z.input<typeof updateDeckSchema>;

export type UpdateDeckData = UpdateData<Deck, "id", UpdateDeckValues>;

export type DeleteDeckData = Pick<Deck, "id">;
