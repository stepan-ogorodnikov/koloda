import { AppError, throwKnownError } from "@koloda/app";
import { cardRowSchema, getInsertCardSchema, getUpdateCardSchema } from "@koloda/srs";
import type {
  Card,
  DeleteCardData,
  DeleteCardsData,
  GetCardsParams,
  InsertCardData,
  InsertCardsResponse,
  ResetCardProgressData,
  UpdateCardData,
} from "@koloda/srs";
import { eq, inArray } from "drizzle-orm";
import { withUpdatedAt } from "./db";
import type { DB } from "./db";
import { assertRow, assertRowOrUndefined, assertRows } from "./parse-rows";
import { cards, reviews } from "./schema";
import { getTemplate, getTemplatesByIds } from "./templates";

export async function getCards(db: DB, { deckId }: GetCardsParams) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(cards).where(eq(cards.deckId, deckId)).orderBy(cards.createdAt);

    return assertRows(cardRowSchema, result);
  });
}

async function getCard(db: DB, id: Card["id"]) {
  return throwKnownError("db.get", async () => {
    const result = await db.select().from(cards).where(eq(cards.id, id)).limit(1);

    return assertRowOrUndefined(cardRowSchema, result[0]);
  });
}

export async function addCard(db: DB, data: InsertCardData) {
  return throwKnownError("db.add", async () => {
    const template = await getTemplate(db, data.templateId);
    if (!template) throw new AppError("not-found.cards.add.template");
    const schema = getInsertCardSchema(template);
    schema.parse(data);

    const result = await db.insert(cards).values(data).returning();

    return assertRow(cardRowSchema, result[0]);
  });
}

export async function addCards(db: DB, data: InsertCardData[]): Promise<InsertCardsResponse> {
  if (data.length === 0) return [];

  const distinctIds = [...new Set(data.map((c) => c.templateId))];
  const templates = await getTemplatesByIds(db, distinctIds);

  const results: InsertCardsResponse = [];

  for (let i = 0; i < data.length; i++) {
    const card = data[i];
    const template = templates.get(card.templateId);
    if (!template) {
      results.push({ error: new AppError("not-found.cards.add.template", `Template id: ${card.templateId}`).message });
      continue;
    }
    try {
      const schema = getInsertCardSchema(template);
      const validated = schema.parse(card);
      await db.insert(cards).values(validated).returning();
      results.push({});
    } catch (e) {
      results.push({ error: e instanceof Error ? e.message : String(e) });
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

    const result = await db.update(cards).set(withUpdatedAt(validated)).where(eq(cards.id, id)).returning();

    return assertRow(cardRowSchema, result[0]);
  });
}

export async function deleteCard(db: DB, { id }: DeleteCardData) {
  return throwKnownError("db.delete", async () => {
    const result = await db.delete(cards).where(eq(cards.id, id));
    return result;
  });
}

export async function deleteCards(db: DB, { ids }: DeleteCardsData) {
  if (ids.length === 0) return;
  return throwKnownError("db.delete", async () => {
    const result = await db.delete(cards).where(inArray(cards.id, ids));
    return result;
  });
}

export async function resetCardProgress(db: DB, { id }: ResetCardProgressData) {
  return throwKnownError("db.update", async () => {
    const card = await getCard(db, id);
    if (!card) throw new AppError("not-found.cards.reset.card", `Card id: ${id}`);

    return db.transaction(async (tx) => {
      await tx.delete(reviews).where(eq(reviews.cardId, id));

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

      const result = await tx.update(cards).set(data).where(eq(cards.id, id)).returning();

      return assertRow(cardRowSchema, result[0]);
    });
  });
}
