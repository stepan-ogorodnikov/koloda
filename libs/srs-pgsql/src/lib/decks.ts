import { throwKnownError, updateDeckSchema } from "@koloda/srs";
import type { Deck, DeleteDeckData, InsertDeckData, UpdateDeckData } from "@koloda/srs";
import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { withUpdatedAt } from "./db";
import type { DB } from "./db";
import { decks } from "./schema";

/**
 * Retrieves all decks from the database with optional filters
 * @param db - The database instance
 * @param filters - Optional SQL filters to apply
 * @returns Array of deck objects
 */
export async function getDecks(db: DB, filters: SQL | undefined = undefined) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(decks)
      .where(filters)
      .orderBy(decks.createdAt);

    return result as Deck[];
  });
}

/**
 * Retrieves a specific deck by ID
 * @param db - The database instance
 * @param id - The ID of the deck to retrieve
 * @returns The deck object if found, null otherwise
 */
export async function getDeck(db: DB, id: Deck["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);

    return (result[0] as Deck) || null;
  });
}

/**
 * Adds a new deck to the database
 * @param db - The database instance
 * @param data - The deck data to insert
 * @returns The created deck object
 */
export async function addDeck(db: DB, data: InsertDeckData) {
  return throwKnownError("db.add", async () => {
    const result = await db
      .insert(decks)
      .values(data)
      .returning();

    return result[0] as Deck;
  });
}

/**
 * Updates an existing deck in the database
 * @param db - The database instance
 * @param id - The ID of the deck to update
 * @param values - The updated deck values
 * @returns The updated deck object
 */
export async function updateDeck(db: DB, { id, values }: UpdateDeckData) {
  return throwKnownError("db.update", async () => {
    const payload = updateDeckSchema.parse(values);
    const result = await db
      .update(decks)
      .set(withUpdatedAt(payload))
      .where(eq(decks.id, id))
      .returning();

    return result[0] as Deck;
  });
}

/**
 * Deletes a deck from the database
 * @param db - The database instance
 * @param id - The ID of the deck to delete
 * @returns The result of the database delete operation
 */
export async function deleteDeck(db: DB, { id }: DeleteDeckData) {
  return throwKnownError("db.delete", async () => {
    const result = await db
      .delete(decks)
      .where(eq(decks.id, id));

    return result;
  });
}
