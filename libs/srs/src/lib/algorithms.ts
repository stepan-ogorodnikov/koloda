import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { algorithmFSRSValidation } from "./algorithms-fsrs";
import type { DB } from "./db";
import { handleDBError, TIMESTAMPS, withUpdatedAt } from "./db";
import type { DeckWithOnlyTitle } from "./decks";
import { algorithms, decks } from "./schema";
import type { UpdateData } from "./utility";

export const algorithmsMessages: Record<string, MessageDescriptor> = {
  "title.min-length": msg`title.min-length`,
  "title.max-length": msg`title.max-length`,
};

export const algorithmsValidation = {
  title: z
    .string()
    .min(1, "title.min-length")
    .max(255, "title.max-length"),
  content: algorithmFSRSValidation,
};

export const selectAlgorithmSchema = createSelectSchema(algorithms);
export type Algorithm = z.infer<typeof selectAlgorithmSchema> & { content: z.infer<typeof algorithmFSRSValidation> };

/**
 * Retrieves all algorithms from the database
 * @param db - The database instance
 * @returns Array of algorithm objects
 */
export async function getAlgorithms(db: DB) {
  try {
    const result = await db
      .select()
      .from(algorithms)
      .orderBy(algorithms.createdAt);

    return result as Algorithm[];
  } catch (e) {
    handleDBError(e);
    return [];
  }
}

/**
 * Retrieves a specific algorithm by ID from the database
 * @param db - The database instance
 * @param id - The ID of the algorithm to retrieve
 * @returns The algorithm object if found, null otherwise
 */
export async function getAlgorithm(db: DB, id: Algorithm["id"] | string) {
  try {
    const result = await db.select().from(algorithms).where(eq(algorithms.id, Number(id))).limit(1);
    return result[0] as Algorithm || null;
  } catch (e) {
    handleDBError(e);
    return undefined;
  }
}

/**
 * Retrieves the default algorithm from the database
 * @param db - The database instance
 * @returns The default algorithm object
 */
export async function getDefaultAlgorithm(db: DB) {
  try {
    const result = await db.select().from(algorithms).limit(1);
    return result[0] as Algorithm;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export const insertAlgorithmSchema = createInsertSchema(algorithms, algorithmsValidation).omit(TIMESTAMPS);
export type InsertAlgorithmData = z.infer<typeof insertAlgorithmSchema>;

/**
 * Adds a new algorithm to the database
 * @param db - The database instance
 * @param data - The algorithm data to insert
 * @returns The created algorithm object
 */
export async function addAlgorithm(db: DB, data: InsertAlgorithmData) {
  try {
    const result = await db.insert(algorithms).values(data).returning();
    return result[0] as Algorithm;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export const updateAlgorithmSchema = createUpdateSchema(algorithms, algorithmsValidation).omit(TIMESTAMPS);
export type UpdateAlgorithmValues = z.infer<typeof updateAlgorithmSchema>;
export type UpdateAlgorithmData = UpdateData<Algorithm, "id", UpdateAlgorithmValues>;

/**
 * Updates an existing algorithm in the database
 * @param db - The database instance
 * @param id - The ID of the algorithm to update
 * @param values - The updated algorithm values
 * @returns The updated algorithm object
 */
export async function updateAlgorithm(db: DB, { id, values }: UpdateAlgorithmData) {
  try {
    const payload = updateAlgorithmSchema.parse(values);
    const result = await db
      .update(algorithms)
      .set(withUpdatedAt(payload))
      .where(eq(algorithms.id, Number(id)))
      .returning();

    return result[0] as Algorithm;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type CloneAlgorithmData = z.infer<typeof cloneAlgorithmSchema>;
export const cloneAlgorithmSchema = insertAlgorithmSchema.pick({ title: true }).extend({ sourceId: z.string() });

/**
 * Clones an existing algorithm with a new title
 * @param db - The database instance
 * @param title - The new title for the cloned algorithm
 * @param sourceId - The ID of the source algorithm to clone
 * @returns The created algorithm object
 */
export async function cloneAlgorithm(db: DB, { title, sourceId }: CloneAlgorithmData) {
  try {
    const sourceAlgorithm = await getAlgorithm(db, sourceId);
    if (!sourceAlgorithm) throw ("Source algorithm not found");
    const data = insertAlgorithmSchema.parse({ ...sourceAlgorithm, title });
    const result = await addAlgorithm(db, data);
    return result as Algorithm;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export type DeleteAlgorithmData = {
  id: Algorithm["id"] | string;
  successorId?: Algorithm["id"] | string | null;
};

/**
 * Deletes an algorithm from the database, optionally replacing it with another algorithm in associated decks
 * @param db - The database instance
 * @param id - The ID of the algorithm to delete
 * @param successorId - Optional ID of the algorithm to replace the deleted one in decks
 * @returns The result of the database delete operation
 */
export async function deleteAlgorithm(db: DB, { id, successorId }: DeleteAlgorithmData) {
  try {
    const algorithmDecks = await getAlgorithmDecks(db, id);
    if (Array.isArray(algorithmDecks) && algorithmDecks.length > 0) {
      const successor = await getAlgorithm(db, id);
      if (!successor) throw new Error("Successor algorithm not found");
      return db.transaction(async (tx) => {
        await tx
          .update(decks)
          .set({ algorithmId: Number(successorId) })
          .where(eq(decks.algorithmId, Number(id)));

        const result = await tx.delete(algorithms).where(eq(algorithms.id, Number(id)));
        return result;
      });
    } else {
      const result = await db.delete(algorithms).where(eq(algorithms.id, Number(id)));
      return result;
    }
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Retrieves all decks associated with a specific algorithm
 * @param db - The database instance
 * @param id - The ID of the algorithm
 * @returns Array of decks with only ID and title
 */
export async function getAlgorithmDecks(db: DB, id: Algorithm["id"] | string) {
  try {
    const result = await db
      .select({ id: decks.id, title: decks.title })
      .from(decks)
      .where(eq(decks.algorithmId, Number(id)));
    return result as DeckWithOnlyTitle[];
  } catch (e) {
    handleDBError(e);
    return [];
  }
}
