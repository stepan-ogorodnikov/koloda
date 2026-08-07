import type { ObjectPropertiesMapping, UpdateData } from "@koloda/app";
import { mapObjectProperties, mapObjectPropertiesReverse, timestampsValidation } from "@koloda/app";
import { createEmptyCard, Rating } from "ts-fsrs";
import type { Card as CardFSRS, DateInput } from "ts-fsrs";
import { z } from "zod";
import type { Algorithm, LessonAlgorithm } from "./algorithms";
import { createFSRSAlgorithm } from "./algorithms-fsrs";
import { deckValidation } from "./decks";
import type { ReviewFSRS } from "./reviews";
import type { Template, TemplateFields } from "./templates";
import { templateValidation } from "./templates";

export const cardValidation = z.object({
  id: z.int(),
  deckId: deckValidation.shape.id,
  templateId: templateValidation.shape.id,
  content: z.record(z.string(), z.object({ text: z.string() })),
  state: z.int().min(0).max(3).default(0),
  dueAt: z.nullable(z.date()).default(null),
  stability: z.number().default(0),
  difficulty: z.number().default(0),
  scheduledDays: z.int().default(0),
  learningSteps: z.int().default(0),
  reps: z.int().default(0),
  lapses: z.int().default(0),
  lastReviewedAt: z.nullable(z.date()).default(null),
});

export const cardRowSchema = cardValidation.extend(timestampsValidation.shape);

// WHY: z.input keeps insert/update callers free to omit defaulted FSRS fields.
export type Card = z.input<typeof cardValidation> & z.infer<typeof timestampsValidation>;

export type GetCardsParams = { deckId: Card["deckId"] };

export function getCardContentValidation(fields: TemplateFields) {
  const validation = fields.reduce(
    (acc, x) => ({
      ...acc,
      [`${x.id}`]: z.object({
        text: x.isRequired ? z.string().min(1, "validation.cards.content.field-empty") : z.string(),
      }),
    }),
    {},
  );

  return { content: z.object(validation) };
}

export function getInsertCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object({ ...insertCardSchema.shape, ...contentValidation });
}

export const insertCardSchema = cardValidation.omit({ id: true });

export type InsertCardData = z.input<typeof insertCardSchema>;

export type InsertCardsResponse = Array<{ error?: string }>;

export function getUpdateCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object(contentValidation);
}

export const updateCardSchema = cardValidation.pick({ content: true });

export type UpdateCardValues = z.input<typeof updateCardSchema>;

export type UpdateCardData = UpdateData<Card, "id", UpdateCardValues>;

export type DeleteCardData = Pick<Card, "id">;

export type DeleteCardsData = { ids: Card["id"][] };

export type CardGrade = {
  card: CardFSRS;
  log: ReviewFSRS;
};

export function getCardGrades(card: Card, algorithm: Pick<Algorithm, "content"> | LessonAlgorithm) {
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

function createFSRSCard(card: Card, time: DateInput = Date.now()): CardFSRS {
  return createEmptyCard(time, (handlerCard: CardFSRS) => {
    const mapped = mapObjectProperties(card, FSRS_CARD_PROPERTIES);
    const filtered = Object.fromEntries(Object.entries(mapped).filter(([_, v]) => v !== null));
    return { ...handlerCard, ...filtered };
  });
}

export function createCardFromCardFSRS(input: CardFSRS) {
  return mapObjectPropertiesReverse(input, FSRS_CARD_PROPERTIES) as Card;
}

export type ResetCardProgressData = { id: Card["id"] };
