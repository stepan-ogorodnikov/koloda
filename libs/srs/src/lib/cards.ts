import type { Modify, ObjectPropertiesMapping, UpdateData } from "@koloda/app";
import { mapObjectProperties, mapObjectPropertiesReverse, timestampsValidation } from "@koloda/app";
import { createEmptyCard, Rating } from "ts-fsrs";
import type { Card as CardFSRS, DateInput } from "ts-fsrs";
import { z } from "zod";
import type { Algorithm, LessonAlgorithm } from "./algorithms";
import { createFSRSAlgorithm } from "./algorithms-fsrs";
import { deckValidation } from "./decks";
import type { ReviewFSRS } from "./reviews";
import type { Template, TemplateFields } from "./templates";
import type { ProgressFieldValues } from "./progress";
import { CARDS_PROGRESS_FIELD_CODES, validateProgressFields } from "./progress";
import { templateValidation } from "./templates";

const cardFieldsSchema = z.object({
  id: z.uuid(),
  deckId: deckValidation.shape.id,
  templateId: templateValidation.shape.id,
  content: z.record(z.string(), z.object({ text: z.string() })),
  state: z.int().default(0),
  dueAt: z.nullable(z.date()).default(null),
  // INVARIANT: desktop Card is `f64`; untouched is 0. Do not make these nullable.
  stability: z.number().default(0),
  difficulty: z.number().default(0),
  scheduledDays: z.int().default(0),
  learningSteps: z.int().default(0),
  reps: z.int().default(0),
  lapses: z.int().default(0),
  lastReviewedAt: z.nullable(z.date()).default(null),
});

function refineCardProgress(data: ProgressFieldValues, ctx: z.RefinementCtx) {
  validateProgressFields(data, CARDS_PROGRESS_FIELD_CODES, ctx);
}

export const cardValidation = cardFieldsSchema.superRefine(refineCardProgress);

export const cardRowSchema = cardFieldsSchema.safeExtend(timestampsValidation.shape).superRefine(refineCardProgress);

// WHY: row type is the schema output, so defaulted FSRS fields are required numbers and
// insert/update callers omit defaults through `InsertCardData` (`z.input`) instead.
export type Card = z.infer<typeof cardRowSchema>;

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

export const insertCardSchema = cardFieldsSchema.omit({ id: true }).superRefine(refineCardProgress);

export type InsertCardData = z.input<typeof insertCardSchema>;

// Mirrors koloda `AddCardsItemResult`: success items omit `error`, failures
// carry the structured `{ code, details? }` using AppError-catalog codes.
export type InsertCardsItemError = {
  code: string;
  details?: string;
};

export type InsertCardsResponse = Array<{ error?: InsertCardsItemError }>;

export function getUpdateCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object(contentValidation);
}

export const updateCardSchema = cardValidation.pick({ content: true });

export type UpdateCardValues = z.input<typeof updateCardSchema>;

export type UpdateCardData = UpdateData<Card, "id", UpdateCardValues>;

// Mirrors koloda `UpdateCardProgress`: exactly the progress columns the lesson submit updates.
// INVARIANT: Rust `due_at` is a required timestamp — FSRS always supplies `due` —
// while `Card.dueAt` stays nullable for untouched rows.
export type UpdateCardProgress = Modify<
  Pick<
    Card,
    | "id"
    | "dueAt"
    | "state"
    | "stability"
    | "difficulty"
    | "scheduledDays"
    | "learningSteps"
    | "reps"
    | "lapses"
    | "lastReviewedAt"
  >,
  { dueAt: Date }
>;

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
    // WHY: null dueAt/lastReviewedAt (untouched rows) must not override the due/last_review defaults createEmptyCard just set.
    const filtered = Object.fromEntries(Object.entries(mapped).filter(([_, v]) => v !== null));
    return { ...handlerCard, ...filtered };
  });
}

export function createCardFromCardFSRS(input: CardFSRS) {
  return mapObjectPropertiesReverse(input, FSRS_CARD_PROPERTIES) as Card;
}

export function createUpdateCardProgress(cardId: Card["id"], input: CardFSRS): UpdateCardProgress {
  const { state, due, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review } = input;
  return {
    id: cardId,
    state,
    dueAt: due,
    stability,
    difficulty,
    scheduledDays: scheduled_days,
    learningSteps: learning_steps,
    reps,
    lapses,
    lastReviewedAt: last_review ?? null,
  };
}

export type ResetCardProgressData = { id: Card["id"] };
