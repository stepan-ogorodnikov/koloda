import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCard, addCards, getCards, resetCardProgress } from "./cards";
import { getReviews } from "./reviews";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  insertReview,
  seedDeckContext,
} from "../test/test-helpers";

describe("cards repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("rejects card content when a required template field is empty", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);

    await expect(addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: {
        ...createCardContent(template),
        "1": { text: "" },
      },
    })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          message: "validation.cards.content.field-empty",
          path: ["content", "1", "text"],
        }),
      ]),
    });
  });

  it("returns per-card results for partial batch insert success", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const validCard = {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
    };
    const invalidCard = {
      deckId: deck.id,
      templateId: template.id,
      content: {
        ...createCardContent(template),
        "1": { text: "" },
      },
    };

    const result = await addCards(db, [validCard, invalidCard]);
    const storedCards = await getCards(db, { deckId: deck.id });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({});
    expect(result[1]?.error).toContain("validation.cards.content.field-empty");
    expect(storedCards).toHaveLength(1);
    expect(storedCards[0]?.content["1"]?.text).toBe("Front value");
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
    expect(reviews).toEqual([]);
  });
});
