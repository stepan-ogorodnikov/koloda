import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { count, eq } from "drizzle-orm";
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

export const selectCardSchema = createSelectSchema(cards, cardValidation);
export type Card = z.input<typeof selectCardSchema>;

export type GetCardsParams = {
  deckId: Deck["id"] | string;
};

/**
 * Retrieves all cards from a specific deck
 * @param db - The database instance
 * @param deckId - The ID of the deck to retrieve cards from
 * @returns Array of card objects
 */
export async function getCards(db: DB, { deckId }: GetCardsParams) {
  const result = await db
    .select()
    .from(cards)
    .where(eq(cards.deckId, Number(deckId)))
    .orderBy(cards.createdAt);

  return result as Card[];
}

export type GetCardsCountParams = { deckId: Deck["id"] | string };

/**
 * Retrieves the total count of cards in a specific deck
 * @param db - The database instance
 * @param deckId - The ID of the deck to count cards for
 * @returns The total number of cards in the deck
 */
export async function getCardsCount(db: DB, { deckId }: GetCardsCountParams) {
  const result = await db
    .select({ count: count() })
    .from(cards)
    .where(eq(cards.deckId, Number(deckId)));

  return result[0].count;
}

/**
 * Retrieves a specific card by ID
 * @param db - The database instance
 * @param id - The ID of the card to retrieve
 * @returns The card object if found, undefined otherwise
 */
export async function getCard(db: DB, id: string | Card["id"]) {
  const result = await db.select().from(cards).where(eq(cards.id, Number(id))).limit(1);
  return result[0] as Card || undefined;
}

/**
 * Creates content validation schema based on template fields
 * @param fields - Array of template fields to validate
 * @returns Object with content validation schema
 */
export function getCardContentValidation(fields: TemplateFields) {
  const validation = fields.reduce((acc, x) => (
    { ...acc, [`${x.id}`]: z.object({ text: x.isRequired ? z.string().min(1, "field.min-length") : z.string() }) }
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
  return createInsertSchema(cards, { ...cardValidation, ...contentValidation }).omit(TIMESTAMPS);
}

export const insertCardSchema = createInsertSchema(cards, cardValidation).omit(TIMESTAMPS);
export type InsertCardData = z.input<typeof insertCardSchema>;

/**
 * Adds a new card to the database
 * @param db - The database instance
 * @param data - The card data to insert
 * @returns The created card object
 */
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

/**
 * Creates an update schema for a card based on a template
 * @param template - The template to base the schema on
 * @returns Zod schema for updating card content
 */
export function getUpdateCardSchema(template: Template) {
  const contentValidation = getCardContentValidation(template.content.fields);
  return z.object(contentValidation);
}

export const updateCardSchema = createUpdateSchema(cards, cardValidation).pick({ content: true });
export type UpdateCardValues = z.input<typeof updateCardSchema>;
export type UpdateCardData = UpdateData<Card, "id", UpdateCardValues>;

/**
 * Updates an existing card in the database
 * @param db - The database instance
 * @param id - The ID of the card to update
 * @param values - The updated card values
 * @returns The updated card object
 */
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

/**
 * Deletes a card from the database
 * @param db - The database instance
 * @param id - The ID of the card to delete
 * @returns The result of the database delete operation
 */
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

/**
 * Resets the progress of a card, clearing its review history and resetting scheduling data
 * @param db - The database instance
 * @param id - The ID of the card to reset
 * @returns The updated card object with reset progress
 */
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
