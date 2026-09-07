import { AppError, throwKnownError } from "@koloda/app";
import { algorithmRowSchema, deckWithOnlyTitleSchema, insertAlgorithmSchema, updateAlgorithmSchema } from "@koloda/srs";
import type {
  Algorithm,
  CloneAlgorithmData,
  DeleteAlgorithmData,
  InsertAlgorithmData,
  UpdateAlgorithmData,
} from "@koloda/srs";
import { eq } from "drizzle-orm";
import { withUpdatedAt } from "./db";
import type { DB } from "./db";
import { assertRow, assertRowOrNull, assertRows } from "./parse-rows";
import { algorithms, decks } from "./schema";

export async function getAlgorithms(db: DB) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(algorithms).orderBy(algorithms.createdAt);

    return assertRows(algorithmRowSchema, result);
  });
}

export async function getAlgorithm(db: DB, id: Algorithm["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(algorithms).where(eq(algorithms.id, id)).limit(1);

    return assertRowOrNull(algorithmRowSchema, result[0]);
  });
}

export async function addAlgorithm(db: DB, data: InsertAlgorithmData) {
  return throwKnownError("db.add", async () => {
    const result = await db.insert(algorithms).values(data).returning();

    return assertRow(algorithmRowSchema, result[0]);
  });
}

export async function updateAlgorithm(db: DB, { id, values }: UpdateAlgorithmData) {
  return throwKnownError("db.update", async () => {
    const payload = updateAlgorithmSchema.parse(values);

    const existing = await getAlgorithm(db, id);
    if (!existing) throw new AppError("not-found.algorithms.update.algorithm", `Algorithm id: ${id}`);

    const result = await db.update(algorithms).set(withUpdatedAt(payload)).where(eq(algorithms.id, id)).returning();

    return assertRow(algorithmRowSchema, result[0]);
  });
}

export async function cloneAlgorithm(db: DB, { title, sourceId }: CloneAlgorithmData) {
  return throwKnownError("db.clone", async () => {
    const sourceAlgorithm = await getAlgorithm(db, sourceId);
    if (!sourceAlgorithm) throw new AppError("not-found.algorithms.clone.source");
    const data = insertAlgorithmSchema.parse({ ...sourceAlgorithm, title });
    return addAlgorithm(db, data);
  });
}

export async function deleteAlgorithm(db: DB, { id, successorId }: DeleteAlgorithmData) {
  return throwKnownError("db.delete", async () => {
    const algorithmDecks = await getAlgorithmDecks(db, id);
    if (Array.isArray(algorithmDecks) && algorithmDecks.length > 0) {
      const successor = await getAlgorithm(db, Number(successorId));
      if (!successor) throw new AppError("not-found.algorithms.delete.successor");
      return db.transaction(async (tx) => {
        await tx
          .update(decks)
          .set({ algorithmId: Number(successorId) })
          .where(eq(decks.algorithmId, id));

        const result = await tx.delete(algorithms).where(eq(algorithms.id, id));

        return result;
      });
    } else {
      const result = await db.delete(algorithms).where(eq(algorithms.id, id));

      return result;
    }
  });
}

export async function getAlgorithmDecks(db: DB, id: Algorithm["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.select({ id: decks.id, title: decks.title }).from(decks).where(eq(decks.algorithmId, id));

    return assertRows(deckWithOnlyTitleSchema, result);
  });
}
