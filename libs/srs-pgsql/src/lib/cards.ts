import { AppError, getInsertCardSchema, getUpdateCardSchema, throwKnownError } from "@koloda/srs";
import type {
  Card,
  DeleteCardData,
  GetCardsCountParams,
  GetCardsParams,
  InsertCardData,
  ResetCardProgressData,
  UpdateCardData,
} from "@koloda/srs";
import { count, eq } from "drizzle-orm";
import { withUpdatedAt } from "./db";
import type { DB } from "./db";
import { cards, reviews } from "./schema";
import { getTemplate } from "./templates";
export type { Card as CardFSRS } from "ts-fsrs";

/**
 * Retrieves all cards from a specific deck
 * @param db - The database instance
 * @param deckId - The ID of the deck to retrieve cards from
 * @returns Array of card objects
 */
export async function getCards(db: DB, { deckId }: GetCardsParams) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(cards)
      .where(eq(cards.deckId, deckId))
      .orderBy(cards.createdAt);

    return result as Card[];
  });
}

/**
 * Retrieves the total count of cards in a specific deck
 * @param db - The database instance
 * @param deckId - The ID of the deck to count cards for
 * @returns The total number of cards in the deck
 */
export async function getCardsCount(db: DB, { deckId }: GetCardsCountParams) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select({ count: count() })
      .from(cards)
      .where(eq(cards.deckId, deckId));

    return result[0].count;
  });
}

/**
 * Retrieves a specific card by ID
 * @param db - The database instance
 * @param id - The ID of the card to retrieve
 * @returns The card object if found, undefined otherwise
 */
async function getCard(db: DB, id: Card["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(cards)
      .where(eq(cards.id, id))
      .limit(1);

    return (result[0] as Card) || undefined;
  });
}

/**
 * Adds a new card to the database
 * @param db - The database instance
 * @param data - The card data to insert
 * @returns The created card object
 */
export async function addCard(db: DB, data: InsertCardData) {
  return throwKnownError("db.add", async () => {
    const template = await getTemplate(db, data.templateId);
    if (!template) throw new AppError("not-found.cards.add.template");
    const schema = getInsertCardSchema(template);
    schema.parse(data);

    const result = await db
      .insert(cards)
      .values(data)
      .returning();

    return result[0] as Card;
  });
}

/**
 * Updates an existing card in the database
 * @param db - The database instance
 * @param id - The ID of the card to update
 * @param values - The updated card values
 * @returns The updated card object
 */
export async function updateCard(db: DB, { id, values }: UpdateCardData) {
  return throwKnownError("db.update", async () => {
    const card = await getCard(db, id);
    if (!card) throw new AppError("not-found.cards.update.card");
    const template = await getTemplate(db, card.templateId);
    if (!template?.content.fields) throw new AppError("not-found.cards.update.template");
    const schema = getUpdateCardSchema(template);
    const validated = schema.parse(values);

    const result = await db
      .update(cards)
      .set(withUpdatedAt(validated))
      .where(eq(cards.id, id))
      .returning();

    return result[0] as Card;
  });
}

/**
 * Deletes a card from the database
 * @param db - The database instance
 * @param id - The ID of the card to delete
 * @returns The result of the database delete operation
 */
export async function deleteCard(db: DB, { id }: DeleteCardData) {
  return throwKnownError("db.delete", async () => {
    const result = await db.delete(cards).where(eq(cards.id, id));
    return result;
  });
}

/**
 * Resets the progress of a card, clearing its review history and resetting scheduling data
 * @param db - The database instance
 * @param id - The ID of the card to reset
 * @returns The updated card object with reset progress
 */
export async function resetCardProgress(db: DB, { id }: ResetCardProgressData) {
  return throwKnownError("db.update", async () => {
    return db.transaction(async (tx) => {
      await tx
        .delete(reviews)
        .where(eq(reviews.cardId, id));

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
        .where(eq(cards.id, id))
        .returning();

      return result[0] as Card;
    });
  });
}
