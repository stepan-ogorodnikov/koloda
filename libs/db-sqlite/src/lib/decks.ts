import { AppError, mintedUuidv7, throwKnownError } from "@koloda/app";
import { deckRowSchema, updateDeckSchema } from "@koloda/srs";
import type { Deck, DeleteDeckData, InsertDeckData, UpdateDeckData } from "@koloda/srs";
import { getAlgorithm } from "./algorithms";
import { DECK_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRowOrNull, parseRows } from "./parse-rows";
import { nowMs, placeholders } from "./sql";
import { getTemplate } from "./templates";

export async function getDecks(db: DB, ids?: Deck["id"][]) {
  return throwKnownError("db.get", async () => {
    if (ids && ids.length === 0) return [];

    const filter = ids?.length ? `WHERE id IN (${placeholders(ids.length)})` : "";
    const result = await db.all(`SELECT ${DECK_SELECT} FROM decks ${filter} ORDER BY created_at`, ids);
    return parseRows(deckRowSchema, result);
  });
}

export async function getDeck(db: DB, id: Deck["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.get(`SELECT ${DECK_SELECT} FROM decks WHERE id = ? LIMIT 1`, [id]);
    return parseRowOrNull(deckRowSchema, result);
  });
}

export async function addDeck(db: DB, data: InsertDeckData) {
  return throwKnownError("db.add", async () => {
    const algorithm = await getAlgorithm(db, data.algorithmId);
    if (!algorithm) throw new AppError("not-found.decks.add.algorithm", `Algorithm id: ${data.algorithmId}`);
    const template = await getTemplate(db, data.templateId);
    if (!template) throw new AppError("not-found.decks.add.template", `Template id: ${data.templateId}`);

    const rowId = mintedUuidv7();
    await db.run(
      `INSERT INTO decks (id, title, algorithm_id, template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL)`,
      [rowId, data.title, data.algorithmId, data.templateId, nowMs()],
    );
    const result = await getDeck(db, rowId);
    if (!result) throw new Error("no row returned");
    return result;
  });
}

export async function updateDeck(db: DB, { id, values }: UpdateDeckData) {
  return throwKnownError("db.update", async () => {
    const payload = updateDeckSchema.parse(values);

    const existing = await getDeck(db, id);
    if (!existing) throw new AppError("not-found.decks.update.deck", `Deck id: ${id}`);
    const algorithm = await getAlgorithm(db, payload.algorithmId);
    if (!algorithm) throw new AppError("not-found.decks.update.algorithm", `Algorithm id: ${payload.algorithmId}`);
    const template = await getTemplate(db, payload.templateId);
    if (!template) throw new AppError("not-found.decks.update.template", `Template id: ${payload.templateId}`);

    await db.run(`UPDATE decks SET title = ?, algorithm_id = ?, template_id = ?, updated_at = ? WHERE id = ?`, [
      payload.title,
      payload.algorithmId,
      payload.templateId,
      nowMs(),
      id,
    ]);

    const result = await getDeck(db, id);
    if (!result) throw new Error("no row returned");
    return result;
  });
}

export async function deleteDeck(db: DB, { id }: DeleteDeckData) {
  return throwKnownError("db.delete", async () => {
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM reviews WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)`, [id]);
      await tx.run(`DELETE FROM cards WHERE deck_id = ?`, [id]);
      await tx.run(`DELETE FROM decks WHERE id = ?`, [id]);
    });
  });
}
