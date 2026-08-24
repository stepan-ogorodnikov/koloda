import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  insertReview,
  seedDeck,
  seedDeckContext,
  seedTemplate,
} from "../test/test-helpers";
import { addCard, deleteCard, getCards } from "./cards";
import { deleteDeck } from "./decks";
import { getReviews } from "./reviews";

describe("referential integrity integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("rejects inserting a card whose deck_id references a missing deck with a foreign-key violation", async () => {
    const { db, client } = testDb;
    const template = await seedTemplate(db);

    await expect(
      client.query('INSERT INTO "cards" ("deck_id", "template_id") VALUES ($1, $2)', [999_999, template.id]),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "cards_deck_id_decks_id_fk",
      table: "cards",
    });
  });

  it("deleting a deck deletes its cards through on-delete-cascade", async () => {
    const { db, client } = testDb;
    const { deck, template } = await seedDeckContext(db);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });
    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    expect(await getCards(db, { deckId: deck.id })).toHaveLength(2);

    await deleteDeck(db, { id: deck.id });

    expect(await getCards(db, { deckId: deck.id })).toEqual([]);

    const { rows } = await client.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "cards"');
    expect(rows[0]?.count).toBe(0);
  });

  it("deleting a card deletes its reviews through on-delete-cascade", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    await insertReview(db, {
      cardId: card.id,
      rating: 3,
      state: 2,
      dueAt: new Date("2026-01-15T09:00:00.000Z"),
      stability: 7.5,
      difficulty: 3.25,
      scheduledDays: 12,
      learningSteps: 2,
      time: 4200,
      isIgnored: false,
      createdAt: new Date("2026-01-10T09:00:00.000Z"),
    });
    expect(await getReviews(db, { cardId: card.id })).toHaveLength(1);

    await deleteCard(db, { id: card.id });

    expect(await getReviews(db, { cardId: card.id })).toEqual([]);
  });

  it("rejects deleting a template still referenced by a deck with a foreign-key violation", async () => {
    const { db, client } = testDb;
    const { template } = await seedDeckContext(db);

    await expect(client.query('DELETE FROM "templates" WHERE "id" = $1', [template.id])).rejects.toMatchObject({
      code: "23503",
      constraint: "decks_template_id_templates_id_fk",
      // WHY: PG reports the referencing side of the constraint on delete violations.
      table: "decks",
    });

    const { rows } = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "templates" WHERE "id" = $1',
      [template.id],
    );
    expect(rows[0]?.count).toBe(1);
  });

  it("rejects deleting a template still referenced only by a card with a foreign-key violation", async () => {
    const { db, client } = testDb;
    const deck = await seedDeck(db);
    const template = await seedTemplate(db);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    await expect(client.query('DELETE FROM "templates" WHERE "id" = $1', [template.id])).rejects.toMatchObject({
      code: "23503",
      constraint: "cards_template_id_templates_id_fk",
      // WHY: PG reports the referencing side of the constraint on delete violations.
      table: "cards",
    });

    const { rows } = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "templates" WHERE "id" = $1',
      [template.id],
    );
    expect(rows[0]?.count).toBe(1);
  });
});
