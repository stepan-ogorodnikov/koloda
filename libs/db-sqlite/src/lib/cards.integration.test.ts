import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InsertCardData, UpdateCardData } from "@koloda/srs";
import { addCard, addCards, deleteCards, getCardCounts, getCards, resetCardProgress, updateCard } from "./cards";
import { getReviews } from "./reviews";
import type { DB } from "./db";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  insertReview,
  MISSING_ID,
  seedAlgorithm,
  seedDeck,
  seedDeckContext,
  seedTemplate,
} from "../test/test-helpers";

const SCHEDULED_CARD = {
  state: 2,
  dueAt: new Date("2030-03-17T17:46:40.000Z"),
  stability: 3.25,
  difficulty: 6.5,
  scheduledDays: 7,
  learningSteps: 4,
  reps: 11,
  lapses: 5,
  lastReviewedAt: new Date("2027-01-15T08:00:00.000Z"),
} satisfies Partial<InsertCardData>;

async function addScheduledCard(db: DB) {
  const { deck, template } = await seedDeckContext(db);
  const card = await addCard(db, {
    ...SCHEDULED_CARD,
    deckId: deck.id,
    templateId: template.id,
    content: createCardContent(template),
  });
  return { deck, template, card };
}

async function insertReviewFor(db: DB, cardId: string) {
  return insertReview(db, {
    cardId,
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
}

describe("cards repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("counts cards grouped by deck", async () => {
    const { db } = testDb;
    const first = await seedDeckContext(db);
    const second = await seedDeckContext(db);
    await addCard(db, {
      deckId: first.deck.id,
      templateId: first.template.id,
      content: createCardContent(first.template),
    });
    await addCard(db, {
      deckId: first.deck.id,
      templateId: first.template.id,
      content: createCardContent(first.template),
    });
    await addCard(db, {
      deckId: second.deck.id,
      templateId: second.template.id,
      content: createCardContent(second.template),
    });

    const counts = await getCardCounts(db);

    expect(counts[first.deck.id]).toBe(2);
    expect(counts[second.deck.id]).toBe(1);
    // Decks without cards simply have no entry.
    expect(counts[MISSING_ID]).toBeUndefined();
  });

  it("round-trips every insert field", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const content = createCardContent(template);

    // WHY: no two columns share a value, so a swap in the INSERT or the row mapper fails the comparison.
    const added = await addCard(db, { ...SCHEDULED_CARD, deckId: deck.id, templateId: template.id, content });
    const [stored] = await getCards(db, { deckId: deck.id });

    expect(stored).toEqual({
      ...SCHEDULED_CARD,
      id: added.id,
      deckId: deck.id,
      templateId: template.id,
      content,
      createdAt: expect.any(Date),
      updatedAt: null,
    });
  });

  it("persists omitted stability and difficulty as 0", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    });

    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
  });

  it("rejects card content when a required template field is empty", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    const frontId = template.content.fields[0]!.id;

    await expect(
      addCard(db, {
        deckId: deck.id,
        templateId: template.id,
        content: {
          ...createCardContent(template),
          [frontId]: { text: "" },
        },
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: "validation.cards.content.field-empty",
          path: ["content", frontId, "text"],
        }),
      ]),
    });
  });

  it("addCard rejects a missing deck", async () => {
    const { db } = testDb;
    const { template } = await seedDeckContext(db);

    await expect(
      addCard(db, {
        deckId: MISSING_ID,
        templateId: template.id,
        content: createCardContent(template),
      }),
    ).rejects.toMatchObject({ code: "not-found.cards.add.deck" });
  });

  it("addCards rejects a missing deck per item", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    const result = await addCards(db, [
      {
        deckId: MISSING_ID,
        templateId: template.id,
        content: createCardContent(template),
      },
      {
        deckId: MISSING_ID,
        templateId: MISSING_ID,
        content: createCardContent(template),
      },
    ]);

    expect(result[0]?.error).toEqual({ code: "not-found.cards.add.deck" });
    expect(result[1]?.error).toEqual({ code: "not-found.cards.add.deck" });
    expect(await getCards(db, { deckId: deck.id })).toEqual([]);
  });

  it("returns per-card results for partial batch insert success", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const validCard = {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    };
    const frontId = template.content.fields[0]!.id;
    const invalidCard = {
      deckId: deck.id,
      templateId: template.id,
      content: {
        ...createCardContent(template),
        [frontId]: { text: "" },
      },
    };

    const result = await addCards(db, [validCard, invalidCard, { ...validCard, templateId: MISSING_ID }]);
    const storedCards = await getCards(db, { deckId: deck.id });

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({});
    expect(result[1]?.error).toEqual({ code: "validation.cards.content.field-empty" });
    expect(result[2]?.error).toEqual({ code: "not-found.cards.add.template" });
    expect(storedCards).toHaveLength(1);
    expect(storedCards[0]?.content[frontId]?.text).toBe("Front value");
  });

  it("supports mixed templates in one batch, each validated against its own template", async () => {
    const { db } = testDb;
    const algorithm = await seedAlgorithm(db);
    const templateA = await seedTemplate(db);
    const templateB = await seedTemplate(db, { title: "Cloze" });
    const deckA = await seedDeck(db, { algorithmId: algorithm.id, templateId: templateA.id });
    const deckB = await seedDeck(db, { algorithmId: algorithm.id, templateId: templateB.id });

    const result = await addCards(db, [
      { deckId: deckA.id, templateId: templateA.id, content: createCardContent(templateA) },
      { deckId: deckB.id, templateId: templateB.id, content: createCardContent(templateB) },
    ]);
    const cardsA = await getCards(db, { deckId: deckA.id });
    const cardsB = await getCards(db, { deckId: deckB.id });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({});
    expect(result[1]).toEqual({});
    expect(cardsA).toHaveLength(1);
    expect(cardsB).toHaveLength(1);
    expect(cardsA[0]?.templateId).toBe(templateA.id);
    expect(cardsB[0]?.templateId).toBe(templateB.id);
  });

  it("clears reviews and resets scheduling fields when card progress is reset", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 2,
      dueAt: new Date("2026-01-15T09:00:00.000Z"),
      stability: 7.5,
      difficulty: 3.25,
      scheduledDays: 12,
      learningSteps: 2,
      reps: 9,
      lapses: 1,
      lastReviewedAt: new Date("2026-01-10T09:00:00.000Z"),
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

    const resetCard = await resetCardProgress(db, { id: card.id });
    const reviews = await getReviews(db, { cardId: card.id });

    expect(resetCard).toMatchObject({
      id: card.id,
      state: 0,
      dueAt: null,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
    });
    expect(resetCard.updatedAt).toEqual(card.updatedAt);
    expect(reviews).toEqual([]);
  });

  it("updates only the content and moves the update time", async () => {
    const { db } = testDb;
    const { template, card } = await addScheduledCard(db);
    const content = createCardContent(template, { [template.content.fields[0]!.id]: "Edited front" });

    const updated = await updateCard(db, { id: card.id, values: { content } });

    expect(updated).toEqual({ ...card, content, updatedAt: expect.any(Date) });
  });

  it.each<{ name: string; arrange: (db: DB) => Promise<UpdateCardData>; error: object }>([
    {
      name: "a missing card",
      arrange: async (db) => {
        const { template } = await addScheduledCard(db);
        return { id: MISSING_ID, values: { content: createCardContent(template) } };
      },
      error: { code: "not-found.cards.update.card" },
    },
    {
      name: "a card whose template is gone",
      arrange: async (db) => {
        const { template, card } = await addScheduledCard(db);
        // WHY: the template foreign key blocks this delete; only a corrupt or synced row reaches it.
        await db.exec("PRAGMA foreign_keys = OFF");
        await db.run("DELETE FROM templates WHERE id = ?", [template.id]);
        await db.exec("PRAGMA foreign_keys = ON");
        return { id: card.id, values: { content: createCardContent(template) } };
      },
      error: { code: "not-found.cards.update.template" },
    },
    {
      name: "an empty required field",
      arrange: async (db) => {
        const { template, card } = await addScheduledCard(db);
        const content = createCardContent(template, { [template.content.fields[0]!.id]: "" });
        return { id: card.id, values: { content } };
      },
      error: {
        issues: expect.arrayContaining([expect.objectContaining({ message: "validation.cards.content.field-empty" })]),
      },
    },
  ])("updateCard rejects $name", async ({ arrange, error }) => {
    const { db } = testDb;
    const data = await arrange(db);

    await expect(updateCard(db, data)).rejects.toMatchObject(error);
  });

  it("bulk delete removes only the selected cards and their reviews", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const cards = [];
    for (const front of ["first", "second", "third"]) {
      const card = await addCard(db, {
        deckId: deck.id,
        templateId: template.id,
        content: createCardContent(template, { [template.content.fields[0]!.id]: front }),
      });
      await insertReviewFor(db, card.id);
      cards.push(card);
    }
    const [first, second, third] = cards;

    await deleteCards(db, { ids: [first.id, third.id] });

    expect((await getCards(db, { deckId: deck.id })).map((card) => card.id)).toEqual([second.id]);
    expect(await getReviews(db, { cardId: first.id })).toEqual([]);
    expect(await getReviews(db, { cardId: third.id })).toEqual([]);
    expect(await getReviews(db, { cardId: second.id })).toHaveLength(1);
  });

  it("bulk delete with no ids keeps every card", async () => {
    const { db } = testDb;
    const { deck, card } = await addScheduledCard(db);

    await deleteCards(db, { ids: [] });

    expect(await getCards(db, { deckId: deck.id })).toEqual([card]);
  });
});
