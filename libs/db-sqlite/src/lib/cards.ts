import { AppError, isAppError, mintedUuidv7, throwKnownError } from "@koloda/app";
import { cardRowSchema, getInsertCardSchema, getUpdateCardSchema } from "@koloda/srs";
import type {
  Card,
  DeleteCardData,
  DeleteCardsData,
  GetCardsParams,
  InsertCardData,
  InsertCardsItemError,
  InsertCardsResponse,
  ResetCardProgressData,
  UpdateCardData,
} from "@koloda/srs";
import { ZodError } from "zod";
import { CARD_SELECT } from "./columns";
import { getDeck, getDecks } from "./decks";
import type { DB } from "./db";
import { parseRow, parseRowOrUndefined, parseRows } from "./parse-rows";
import { FSRS_NEW, nowMs, placeholders } from "./sql";
import { getTemplate, getTemplatesByIds } from "./templates";

export async function getCards(db: DB, { deckId }: GetCardsParams) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(`SELECT ${CARD_SELECT} FROM cards WHERE deck_id = ? ORDER BY created_at`, [deckId]);
    return parseRows(cardRowSchema, result);
  });
}

export async function getCardCounts(db: DB): Promise<Record<string, number>> {
  return throwKnownError("db.get", async () => {
    const rows = await db.all(`SELECT deck_id AS deckId, COUNT(*) AS count FROM cards GROUP BY deck_id`);

    const counts: Record<string, number> = {};
    for (const row of rows) counts[String(row.deckId)] = Number(row.count);
    return counts;
  });
}

async function getCard(db: DB, id: Card["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.get(`SELECT ${CARD_SELECT} FROM cards WHERE id = ? LIMIT 1`, [id]);
    return parseRowOrUndefined(cardRowSchema, result);
  });
}

async function insertCardRow(db: DB, data: InsertCardData) {
  const rowId = mintedUuidv7();
  await db.run(
    `INSERT INTO cards (id, deck_id, template_id, content, state, due_at, stability,
                        difficulty, scheduled_days, learning_steps, reps, lapses,
                        last_reviewed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      rowId,
      data.deckId,
      data.templateId,
      JSON.stringify(data.content),
      data.state ?? 0,
      data.dueAt ?? null,
      data.stability ?? 0,
      data.difficulty ?? 0,
      data.scheduledDays ?? 0,
      data.learningSteps ?? 0,
      data.reps ?? 0,
      data.lapses ?? 0,
      data.lastReviewedAt ?? null,
      nowMs(),
    ],
  );
  const result = await getCard(db, rowId);
  if (!result) throw new Error("no row returned");
  return result;
}

export async function addCard(db: DB, data: InsertCardData) {
  return throwKnownError("db.add", async () => {
    const deck = await getDeck(db, data.deckId);
    if (!deck) throw new AppError("not-found.cards.add.deck", `Deck id: ${data.deckId}`);
    const template = await getTemplate(db, data.templateId);
    if (!template) throw new AppError("not-found.cards.add.template");
    const schema = getInsertCardSchema(template);
    schema.parse(data);

    return insertCardRow(db, data);
  });
}

function toInsertCardsItemError(e: unknown): InsertCardsItemError {
  if (e instanceof ZodError) {
    // WHY: zod issue messages carry AppError-catalog codes (see getCardContentValidation),
    // so the first issue becomes the code and any remaining issues become details.
    const [first, ...rest] = e.issues;
    const details = rest.map((issue) => issue.message).join(", ");
    return details ? { code: first?.message ?? "unknown", details } : { code: first?.message ?? "unknown" };
  }
  if (isAppError(e)) {
    return e.details ? { code: e.code, details: e.details } : { code: e.code };
  }
  return { code: "unknown", details: e instanceof Error ? e.message : String(e) };
}

export async function addCards(db: DB, data: InsertCardData[]): Promise<InsertCardsResponse> {
  if (data.length === 0) return [];

  const distinctDeckIds = [...new Set(data.map((card) => card.deckId))];
  const foundDeckIds = new Set((await getDecks(db, distinctDeckIds)).map((deck) => deck.id));

  const distinctIds = [...new Set(data.map((card) => card.templateId))];
  const templates = await getTemplatesByIds(db, distinctIds);

  const results: InsertCardsResponse = [];

  for (let i = 0; i < data.length; i++) {
    const card = data[i];
    // INVARIANT: same order as desktop `add_cards`; a row missing both must report deck, not template.
    if (!foundDeckIds.has(card.deckId)) {
      results.push({ error: { code: "not-found.cards.add.deck" } });
      continue;
    }
    const template = templates.get(card.templateId);
    if (!template) {
      results.push({ error: { code: "not-found.cards.add.template" } });
      continue;
    }
    try {
      const schema = getInsertCardSchema(template);
      const validated = schema.parse(card);
      await insertCardRow(db, validated);
      results.push({});
    } catch (e) {
      results.push({ error: toInsertCardsItemError(e) });
    }
  }

  return results;
}

export async function updateCard(db: DB, { id, values }: UpdateCardData) {
  return throwKnownError("db.update", async () => {
    const card = await getCard(db, id);
    if (!card) throw new AppError("not-found.cards.update.card");
    const template = await getTemplate(db, card.templateId);
    if (!template?.content.fields) throw new AppError("not-found.cards.update.template");
    const schema = getUpdateCardSchema(template);
    const validated = schema.parse(values);

    await db.run(`UPDATE cards SET content = ?, updated_at = ? WHERE id = ?`, [
      JSON.stringify(validated.content),
      nowMs(),
      id,
    ]);

    const result = await getCard(db, id);
    return parseRow(cardRowSchema, result);
  });
}

export async function deleteCard(db: DB, { id }: DeleteCardData) {
  return throwKnownError("db.delete", async () => {
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM reviews WHERE card_id = ?`, [id]);
      await tx.run(`DELETE FROM cards WHERE id = ?`, [id]);
    });
  });
}

export async function deleteCards(db: DB, { ids }: DeleteCardsData) {
  if (ids.length === 0) return;
  return throwKnownError("db.delete", async () => {
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM reviews WHERE card_id IN (${placeholders(ids.length)})`, ids);
      await tx.run(`DELETE FROM cards WHERE id IN (${placeholders(ids.length)})`, ids);
    });
  });
}

export async function resetCardProgress(db: DB, { id }: ResetCardProgressData) {
  return throwKnownError("db.update", async () => {
    const card = await getCard(db, id);
    if (!card) throw new AppError("not-found.cards.reset.card", `Card id: ${id}`);

    return db.transaction(async (tx) => {
      await tx.run(`DELETE FROM reviews WHERE card_id = ?`, [id]);
      await tx.run(
        `UPDATE cards
         SET state = ?, due_at = NULL, stability = 0, difficulty = 0,
             scheduled_days = 0, learning_steps = 0, reps = 0, lapses = 0,
             last_reviewed_at = NULL
         WHERE id = ?`,
        [FSRS_NEW, id],
      );

      const result = await tx.get(`SELECT ${CARD_SELECT} FROM cards WHERE id = ? LIMIT 1`, [id]);
      return parseRow(cardRowSchema, result);
    });
  });
}
