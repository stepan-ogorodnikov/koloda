import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { handleDBError, TIMESTAMPS, withUpdatedAt } from "./db";
import type { DB } from "./db";
import { decks } from "./schema";
import type { Template } from "./templates";
import type { UpdateData } from "./utility";

export const decksMessages: Record<string, MessageDescriptor> = {
  "title.min-length": msg`title.min-length`,
  "title.max-length": msg`title.max-length`,
};

const deckValidation = {
  title: z
    .string()
    .min(1, "title.min-length")
    .max(255, "title.max-length"),
};

export const selectDeckSchema = createSelectSchema(decks);
export type Deck = z.infer<typeof selectDeckSchema>;
export type DeckWithTemplate = Deck & { template: Template };
export type DeckWithOnlyTitle = Pick<Deck, "id" | "title">;

/**
 * Retrieves all decks from the database with optional filters
 * @param db - The database instance
 * @param filters - Optional SQL filters to apply
 * @returns Array of deck objects
 */
export async function getDecks(db: DB, filters: SQL | undefined = undefined) {
  const result = await db.select().from(decks).where(filters);
  return result as Deck[];
}

/**
 * Retrieves a specific deck by ID
 * @param db - The database instance
 * @param id - The ID of the deck to retrieve
 * @returns The deck object if found, null otherwise
 */
export async function getDeck(db: DB, id: string | Deck["id"]) {
  try {
    const result = await db.query.decks.findFirst({ where: eq(decks.id, Number(id)) });
    return result || null;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export const insertDeckSchema = createInsertSchema(decks, deckValidation).omit(TIMESTAMPS);
export type InsertDeckData = z.infer<typeof insertDeckSchema>;

/**
 * Adds a new deck to the database
 * @param db - The database instance
 * @param data - The deck data to insert
 * @returns The created deck object
 */
export async function addDeck(db: DB, data: InsertDeckData) {
  try {
    const result = await db.insert(decks).values(data).returning();
    return result[0] as Deck;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export const updateDeckSchema = createUpdateSchema(decks);
export type UpdateDeckValues = z.input<typeof updateDeckSchema>;
export type UpdateDeckData = UpdateData<Deck, "id", UpdateDeckValues>;

/**
 * Updates an existing deck in the database
 * @param db - The database instance
 * @param id - The ID of the deck to update
 * @param values - The updated deck values
 * @returns The updated deck object
 */
export async function updateDeck(db: DB, { id, values }: UpdateDeckData) {
  try {
    const payload = updateDeckSchema.parse(values);
    const result = await db
      .update(decks)
      .set(withUpdatedAt(payload))
      .where(eq(decks.id, Number(id)))
      .returning();

    return result[0] as Deck;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type DeleteDeckData = Pick<Deck, "id">;

/**
 * Deletes a deck from the database
 * @param db - The database instance
 * @param id - The ID of the deck to delete
 * @returns The result of the database delete operation
 */
export async function deleteDeck(db: DB, { id }: DeleteDeckData) {
  try {
    const result = await db.delete(decks).where(eq(decks.id, Number(id)));
    return result;
  } catch (e) {
    handleDBError(e);
    return;
  }
}
