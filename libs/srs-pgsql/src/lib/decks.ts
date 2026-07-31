import { AppError, throwKnownError } from "@koloda/app";
import { deckRowSchema, updateDeckSchema } from "@koloda/srs";
import type { Deck, DeleteDeckData, InsertDeckData, UpdateDeckData } from "@koloda/srs";
import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getAlgorithm } from "./algorithms";
import { withUpdatedAt } from "./db";
import type { DB } from "./db";
import { assertRow, assertRowOrNull, assertRows } from "./parse-rows";
import { decks } from "./schema";
import { getTemplate } from "./templates";

/**
 * Retrieves all decks from the database with optional filters
 * @param db - The database instance
 * @param filters - Optional SQL filters to apply
 * @returns Array of deck objects
 */
export async function getDecks(db: DB, filters: SQL | undefined = undefined) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(decks).where(filters).orderBy(decks.createdAt);

    return assertRows(deckRowSchema, result);
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
    const result = await db.select().from(decks).where(eq(decks.id, id)).limit(1);

    return assertRowOrNull(deckRowSchema, result[0]);
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
    const algorithm = await getAlgorithm(db, data.algorithmId);
    if (!algorithm) throw new AppError("not-found.decks.add.algorithm", `Algorithm id: ${data.algorithmId}`);
    const template = await getTemplate(db, data.templateId);
    if (!template) throw new AppError("not-found.decks.add.template", `Template id: ${data.templateId}`);

    const result = await db.insert(decks).values(data).returning();

    return assertRow(deckRowSchema, result[0]);
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

    const existing = await getDeck(db, id);
    if (!existing) throw new AppError("not-found.decks.update.deck", `Deck id: ${id}`);
    const algorithm = await getAlgorithm(db, payload.algorithmId);
    if (!algorithm) throw new AppError("not-found.decks.update.algorithm", `Algorithm id: ${payload.algorithmId}`);
    const template = await getTemplate(db, payload.templateId);
    if (!template) throw new AppError("not-found.decks.update.template", `Template id: ${payload.templateId}`);

    const result = await db.update(decks).set(withUpdatedAt(payload)).where(eq(decks.id, id)).returning();

    return assertRow(deckRowSchema, result[0]);
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
    const result = await db.delete(decks).where(eq(decks.id, id));

    return result;
  });
}
