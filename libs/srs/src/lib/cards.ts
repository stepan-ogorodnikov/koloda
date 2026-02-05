import { createEmptyCard, Rating } from "ts-fsrs";
import type { Card as CardFSRS, DateInput } from "ts-fsrs";
import { z } from "zod";
import type { Algorithm } from "./algorithms";
import { createFSRSAlgorithm } from "./algorithms-fsrs";
import type { Timestamps } from "./db";
import { deckValidation } from "./decks";
import type { ReviewFSRS } from "./reviews";
import type { Template, TemplateFields } from "./templates";
import { templateValidation } from "./templates";
import { mapObjectProperties, mapObjectPropertiesReverse } from "./utility";
import type { ObjectPropertiesMapping, UpdateData } from "./utility";
export type { Card as CardFSRS } from "ts-fsrs";

export const cardValidation = z.object({
  id: z.int(),
  deckId: deckValidation.shape.id,
  templateId: templateValidation.shape.id,
  content: z.record(z.string(), z.object({ text: z.string() })),
  state: z.int().min(0).max(3).default(0),
  dueAt: z.nullable(z.date()),
  stability: z.number().default(0),
  difficulty: z.number().default(0),
  scheduledDays: z.int().default(0),
  learningSteps: z.int().default(0),
  reps: z.int().default(0),
  lapses: z.int().default(0),
  lastReviewedAt: z.nullable(z.date()),
});

export type Card = z.input<typeof cardValidation> & Timestamps;

export type GetCardsParams = { deckId: Card["deckId"] };

export type GetCardsCountParams = { deckId: Card["deckId"] };

/**
 * Creates content validation schema based on template fields
 * @param fields - Array of template fields to validate
 * @returns Object with content validation schema
 */
export function getCardContentValidation(fields: TemplateFields) {
  const validation = fields.reduce((acc, x) => (
    {
      ...acc,
      [`${x.id}`]: z.object({ text: x.isRequired ? z.string().min(1, "validation.cards.content.field-empty") : z.string() }),
    }
  ), {});

  return { content: z.object(validation) };
}

/**
 * Creates an insert schema for a card based on a template
 * @param template - The template to base the schema on
 * @returns Zod schema for inserting cards
 */
export function getInsertCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object({ ...insertCardSchema.shape, ...contentValidation });
}

export const insertCardSchema = cardValidation.omit({ id: true });

export type InsertCardData = z.input<typeof insertCardSchema>;

/**
 * Creates an update schema for a card based on a template
 * @param template - The template to base the schema on
 * @returns Zod schema for updating card content
 */
export function getUpdateCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object(contentValidation);
}

export const updateCardSchema = cardValidation.pick({ content: true });

export type UpdateCardValues = z.input<typeof updateCardSchema>;

export type UpdateCardData = UpdateData<Card, "id", UpdateCardValues>;

export type DeleteCardData = Pick<Card, "id">;

export type CardGrade = {
  card: CardFSRS;
  log: ReviewFSRS;
};

/**
 * Calculates card grades based on the algorithm
 * @param card - The card to grade
 * @param algorithm - The algorithm to use for grading
 * @returns Array of ts-fsrs grades in order: [Again, Hard, Good, Easy]
 */
export function getCardGrades(card: Card, algorithm: Algorithm) {
  const fsrsCard = createFSRSCard(card);
  const fsrsAlgorithm = createFSRSAlgorithm(algorithm.content);
  const grades = fsrsAlgorithm.repeat(fsrsCard, new Date());
  return [grades[Rating.Again], grades[Rating.Hard], grades[Rating.Good], grades[Rating.Easy]] as CardGrade[];
}

const FSRS_CARD_PROPERTIES: ObjectPropertiesMapping<Card, CardFSRS> = {
  dueAt: "due",
  lastReviewedAt: "last_review",
  learningSteps: "learning_steps",
  scheduledDays: "scheduled_days",
} as const;

/**
 * Creates a ts-fsrs card from a card
 * @param card - The card to convert
 * @param time - The time to use for card creation (defaults to current time)
 * @returns The ts-fsrs card object
 */
function createFSRSCard(card: Card, time: DateInput = Date.now()): CardFSRS {
  return createEmptyCard(time, (handlerCard: CardFSRS) => {
    const mapped = mapObjectProperties(card, FSRS_CARD_PROPERTIES);
    const filtered = Object.fromEntries(Object.entries(mapped).filter(([_, v]) => v !== null));
    return { ...handlerCard, ...filtered };
  });
}

/**
 * Creates a card from a ts-fsrs card
 * @param input - The ts-fsrs card to convert
 * @returns The card object
 */
export function createCardFromCardFSRS(input: CardFSRS) {
  return mapObjectPropertiesReverse(input, FSRS_CARD_PROPERTIES) as Card;
}

export type ResetCardProgressData = { id: Card["id"] };
