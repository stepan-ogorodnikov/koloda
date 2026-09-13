import { AppError, mintedUuidv7, throwKnownError } from "@koloda/app";
import { algorithmRowSchema, deckWithOnlyTitleSchema, insertAlgorithmSchema, updateAlgorithmSchema } from "@koloda/srs";
import type {
  Algorithm,
  CloneAlgorithmData,
  DeleteAlgorithmData,
  InsertAlgorithmData,
  UpdateAlgorithmData,
} from "@koloda/srs";
import { ALGORITHM_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRowOrNull, parseRows } from "./parse-rows";
import { getSettings } from "./settings";
import { nowMs } from "./sql";

export async function getAlgorithms(db: DB) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(`SELECT ${ALGORITHM_SELECT} FROM algorithms ORDER BY created_at`);
    return parseRows(algorithmRowSchema, result);
  });
}

export async function getAlgorithm(db: DB, id: Algorithm["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.get(`SELECT ${ALGORITHM_SELECT} FROM algorithms WHERE id = ? LIMIT 1`, [id]);
    return parseRowOrNull(algorithmRowSchema, result);
  });
}

export async function addAlgorithm(db: DB, data: InsertAlgorithmData, id?: string) {
  return throwKnownError("db.add", async () => {
    const payload = insertAlgorithmSchema.parse(data);
    const rowId = mintedUuidv7(id);
    await db.run(`INSERT INTO algorithms (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, NULL)`, [
      rowId,
      payload.title,
      JSON.stringify(payload.content),
      nowMs(),
    ]);
    const result = await getAlgorithm(db, rowId);
    if (!result) throw new Error("no row returned");
    return result;
  });
}

export async function updateAlgorithm(db: DB, { id, values }: UpdateAlgorithmData) {
  return throwKnownError("db.update", async () => {
    const payload = updateAlgorithmSchema.parse(values);

    const existing = await getAlgorithm(db, id);
    if (!existing) throw new AppError("not-found.algorithms.update.algorithm", `Algorithm id: ${id}`);

    await db.run(`UPDATE algorithms SET title = ?, content = ?, updated_at = ? WHERE id = ?`, [
      payload.title,
      JSON.stringify(payload.content),
      nowMs(),
      id,
    ]);

    const result = await getAlgorithm(db, id);
    if (!result) throw new Error("no row returned");
    return result;
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
    // INVARIANT: the learning default (LEARNING-SETTINGS.md §Defaults) and the last remaining
    // algorithm (ALGORITHMS.md §Deleting Algorithms) are not deletable. UI disable is a
    // convenience, not the enforcement — keep these guards ahead of the successor reassignment.
    const learning = await getSettings(db, "learning");
    if (learning?.content.defaults.algorithm === id) throw new AppError("validation.algorithms.delete-default");

    const [{ count }] = await db.all("SELECT COUNT(*) AS count FROM algorithms");
    if (Number(count) <= 1) throw new AppError("validation.algorithms.delete-last");

    const algorithmDecks = await getAlgorithmDecks(db, id);
    if (algorithmDecks.length > 0) {
      // WHY: self counts as a missing successor — reassigning the decks to the algorithm being
      // deleted would no-op and the delete would violate the decks FK. Twin of Rust `delete_algorithm`.
      if (!successorId || successorId === id) throw new AppError("not-found.algorithms.delete.successor");
      const successor = await getAlgorithm(db, successorId);
      if (!successor) throw new AppError("not-found.algorithms.delete.successor");
      return db.transaction(async (tx) => {
        await tx.run(`UPDATE decks SET algorithm_id = ? WHERE algorithm_id = ?`, [successorId, id]);
        await tx.run(`DELETE FROM algorithms WHERE id = ?`, [id]);
      });
    }
    await db.run(`DELETE FROM algorithms WHERE id = ?`, [id]);
  });
}

export async function getAlgorithmDecks(db: DB, id: Algorithm["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(`SELECT id, title FROM decks WHERE algorithm_id = ?`, [id]);
    return parseRows(deckWithOnlyTitleSchema, result);
  });
}
