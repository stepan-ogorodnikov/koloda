import { generateUuidv7 } from "@koloda/app";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  insertReview,
  isForeignKeyError,
  MISSING_ID,
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
    const { db } = testDb;
    const template = await seedTemplate(db);

    await expect(
      db.run("INSERT INTO cards (id, deck_id, template_id, content, created_at) VALUES (?, ?, ?, ?, ?)", [
        generateUuidv7(),
        MISSING_ID,
        template.id,
        "{}",
        Date.now(),
      ]),
    ).rejects.toSatisfy(isForeignKeyError);
  });

  it("deleting a deck deletes its cards after leaf-first review and card deletes", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const otherDeck = await seedDeck(db, {
      title: "Other deck",
      algorithmId: deck.algorithmId,
      templateId: template.id,
    });
    const otherCard = await addCard(db, {
      deckId: otherDeck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });
    await addCard(db, {
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

    expect(await getCards(db, { deckId: deck.id })).toHaveLength(2);

    await deleteDeck(db, { id: deck.id });

    expect(await getCards(db, { deckId: deck.id })).toEqual([]);
    expect(await getReviews(db, { cardId: card.id })).toEqual([]);
    // Twin of the other-deck check in `delete_deck_removes_deck_and_cascades_cards_and_reviews`.
    expect((await getCards(db, { deckId: otherDeck.id })).map((row) => row.id)).toEqual([otherCard.id]);
  });

  it("deleting a card deletes its reviews after a leaf-first review delete", async () => {
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
    const { db } = testDb;
    const { template } = await seedDeckContext(db);

    await expect(db.run("DELETE FROM templates WHERE id = ?", [template.id])).rejects.toSatisfy(isForeignKeyError);

    const [{ count }] = await db.all("SELECT COUNT(*) AS count FROM templates WHERE id = ?", [template.id]);
    expect(Number(count)).toBe(1);
  });

  it("rejects deleting a template still referenced only by a card with a foreign-key violation", async () => {
    const { db } = testDb;
    const deck = await seedDeck(db);
    const template = await seedTemplate(db);

    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    await expect(db.run("DELETE FROM templates WHERE id = ?", [template.id])).rejects.toSatisfy(isForeignKeyError);

    const [{ count }] = await db.all("SELECT COUNT(*) AS count FROM templates WHERE id = ?", [template.id]);
    expect(Number(count)).toBe(1);
  });
});
