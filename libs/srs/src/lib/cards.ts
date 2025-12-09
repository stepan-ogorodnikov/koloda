import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { createEmptyCard, Rating } from "ts-fsrs";
import type { Card as CardFSRS, DateInput } from "ts-fsrs";
import { z } from "zod";
import type { Algorithm } from "./algorithms";
import { createFSRSAlgorithm } from "./algorithms-fsrs";
import { handleDBError, TIMESTAMPS, withUpdatedAt } from "./db";
import type { DB } from "./db";
import type { Deck } from "./decks";
import type { ReviewFSRS } from "./reviews";
import { cards, reviews } from "./schema";
import type { Template, TemplateFields } from "./templates";
import { getTemplate } from "./templates";
import type { ZodIssue } from "./utility";
import { mapObjectProperties, mapObjectPropertiesReverse } from "./utility";
import type { ObjectPropertiesMapping, UpdateData } from "./utility";
export type { Card as CardFSRS } from "ts-fsrs";

export const cardContentMessages: Record<string, MessageDescriptor> = {
  "field.min-length": msg`card.errors.field-empty`,
};

const cardValidation = {
  content: z.record(z.string(), z.object({ text: z.string() })),
  state: z.int().min(0).max(3).default(0),
};

export function getCardContentErrors(errors: ZodIssue[]) {
  const result: Record<string, MessageDescriptor[]> = {};
  errors.forEach((issue) => {
    if (typeof issue.path[0] === "string" && issue.path[1] === "text") {
      if (!Array.isArray(result[issue.path[0]])) result[issue.path[0]] = [];
      const t = cardContentMessages[issue.code];
      if (t) result[issue.path[0]].push(t);
    }
  });
  return result;
}

export const selectCardSchema = createSelectSchema(cards, cardValidation);
export type Card = z.input<typeof selectCardSchema>;

export type GetCardsParams = { deckId: Deck["id"] | string };

export async function getCards(db: DB, { deckId }: GetCardsParams) {
  const result = await db
    .select()
    .from(cards)
    .where(eq(cards.deckId, Number(deckId)))
    .orderBy(cards.createdAt);

  return result as Card[];
}

export async function getCard(db: DB, id: string | Card["id"]) {
  const result = await db.select().from(cards).where(eq(cards.id, Number(id))).limit(1);
  return result[0] as Card | undefined;
}

export function getCardContentValidation(fields: TemplateFields) {
  const validation = fields.reduce((acc, x) => (
    { ...acc, [`${x.id}`]: z.object({ text: x.isRequired ? z.string().min(1, "field.min-length") : z.string() }) }
  ), {});

  return { content: z.object(validation) };
}

export function getInsertCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return createInsertSchema(cards, { ...cardValidation, ...contentValidation }).omit(TIMESTAMPS);
}

export const insertCardSchema = createInsertSchema(cards, cardValidation).omit(TIMESTAMPS);
export type InsertCardData = z.input<typeof insertCardSchema>;

export async function addCard(db: DB, data: InsertCardData) {
  try {
    const template = await getTemplate(db, data.templateId);
    if (!template) throw "Template not found";
    const schema = getInsertCardSchema(template);
    schema.parse(data);

    const result = await db
      .insert(cards)
      .values(data)
      .returning();

    return result[0] as Card;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export function getUpdateCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object(contentValidation);
}

export const updateCardSchema = createUpdateSchema(cards, cardValidation).pick({ content: true });
export type UpdateCardValues = z.input<typeof updateCardSchema>;
export type UpdateCardData = UpdateData<Card, "id", UpdateCardValues>;

export async function updateCard(db: DB, { id, values }: UpdateCardData) {
  try {
    const card = await getCard(db, id);
    if (!card) throw "Card not found";
    const template = await getTemplate(db, card.templateId);
    if (!template?.content.fields) throw "Template not found";
    const schema = getUpdateCardSchema(template);
    const validated = schema.parse(values);

    const result = await db
      .update(cards)
      .set(withUpdatedAt(validated))
      .where(eq(cards.id, Number(id)))
      .returning();

    return result[0] as Card;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type DeleteCardData = Pick<Card, "id">;

export async function deleteCard(db: DB, { id }: DeleteCardData) {
  try {
    const result = await db.delete(cards).where(eq(cards.id, Number(id)));
    return result;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type CardGrade = {
  card: CardFSRS;
  log: ReviewFSRS;
};

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

export async function resetCardProgress(db: DB, { id }: ResetCardProgressData) {
  try {
    return db.transaction(async (tx) => {
      await tx.delete(reviews).where(eq(reviews.cardId, Number(id)));

      const data = {
        state: 0,
        dueAt: null,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        lastReviewedAt: null,
      };

      const result = await tx
        .update(cards)
        .set(data)
        .where(eq(cards.id, Number(id)))
        .returning();

      return result[0] as Card;
    });
  } catch (e) {
    handleDBError(e);
    return;
  }
}
