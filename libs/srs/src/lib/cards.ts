import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { createEmptyCard, Rating } from "ts-fsrs";
import type { Card as CardFSRS, DateInput } from "ts-fsrs";
import { z } from "zod";
import type { Algorithm } from "./algorithms";
import { createFSRSAlgorithm } from "./algorithms-fsrs";
import { handleDBError, TIMESTAMPS } from "./db";
import type { DB } from "./db";
import type { Deck } from "./decks";
import type { ReviewFSRS } from "./reviews";
import { cards } from "./schema";
import type { TemplateFields } from "./templates";
import { getTemplate } from "./templates";
import { mapObjectProperties, mapObjectPropertiesReverse } from "./utility";
import type { ObjectPropertiesMapping } from "./utility";
export type { Card as CardFSRS } from "ts-fsrs";

const cardValidation = {
  content: z.record(
    z.string(),
    z.object({
      text: z.string(),
    }),
  ),
  state: z.int().min(0).max(3).default(0),
};

export const selectCardSchema = createSelectSchema(cards, cardValidation);
export type Card = z.input<typeof selectCardSchema>;

export type GetCardsParams = { deckId: Deck["id"] | string };

export async function getCards(db: DB, { deckId }: GetCardsParams) {
  const result = await db.select().from(cards).where(eq(cards.deckId, Number(deckId)));
  return result as Card[];
}

export async function getCard(db: DB, id: string) {
  const result = await db.select().from(cards).where(eq(cards.id, Number(id))).limit(1);
  return result[0] as Card | undefined;
}

export const insertCardSchema = createInsertSchema(cards, cardValidation).omit(TIMESTAMPS);
export type InsertCardData = z.input<typeof insertCardSchema>;

export async function addCard(db: DB, data: InsertCardData) {
  try {
    const template = await getTemplate(db, data.templateId);
    if (!template?.content.fields) throw "Template not found";
    const contentValidation = makeCardContentValidation(template.content.fields);
    contentValidation.parse(data.content);

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

function makeCardContentValidation(fields: TemplateFields) {
  const validation = fields.reduce((acc, x) => (
    { ...acc, [`${x.id}`]: z.object({ text: x.isRequired ? z.string().min(1) : z.string() }) }
  ), {});

  return z.object(validation);
}

export const updateCardSchema = createUpdateSchema(cards, cardValidation).omit(TIMESTAMPS);
export type UpdateCardData = z.infer<typeof updateCardSchema>;

export async function updateCard(db: DB, data: Card) {
  try {
    const { id, ...values } = data;
    const validated = updateCardSchema.parse(values);
    const result = await db.update(cards).set(validated).where(eq(cards.id, Number(id))).returning();
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
