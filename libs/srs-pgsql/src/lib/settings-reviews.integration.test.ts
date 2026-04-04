import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCard } from "./cards";
import { settings } from "./schema";
import { getSettings, patchSettings, setSettings } from "./settings";
import { getTodaysReviewTotals } from "./reviews";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  insertReview,
  seedDeckContext,
  seedLearningSettings,
} from "../test/test-helpers";

describe("settings and review totals integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await testDb.close();
  });

  it("patches nested settings without overwriting untouched fields", async () => {
    const { db } = testDb;
    const { algorithm, template } = await seedDeckContext(db);

    await setSettings(db, {
      name: "learning",
      content: {
        defaults: { algorithm: algorithm.id, template: template.id },
        dailyLimits: {
          total: 40,
          untouched: { value: 10, counts: true },
          learn: { value: 5, counts: false },
          review: { value: 20, counts: true },
        },
        dayStartsAt: "05:00",
        learnAheadLimit: [0, 30],
      },
    });

    const result = await patchSettings(db, {
      name: "learning",
      content: {
        dailyLimits: {
          untouched: { value: 12 },
        },
      },
    });

    expect(result.content).toMatchObject({
      defaults: { algorithm: algorithm.id, template: template.id },
      dayStartsAt: "05:00",
      learnAheadLimit: [0, 30],
      dailyLimits: {
        total: 40,
        untouched: { value: 12, counts: true },
        learn: { value: 5, counts: false },
        review: { value: 20, counts: true },
      },
    });
  });

  it("returns normalized settings content with schema defaults applied", async () => {
    const { db } = testDb;

    await db.insert(settings).values({
      name: "interface",
      content: { language: "ru" },
    });

    const result = await getSettings(db, "interface");

    expect(result?.content).toEqual({
      language: "ru",
      theme: "system",
      motion: "system",
    });
  });

  it("calculates today's review totals using the learning day boundary and counts flags", async () => {
    const { db } = testDb;
    const { algorithm, template, deck } = await seedDeckContext(db);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10, 4, 30, 0));

    await seedLearningSettings(db, { algorithm: algorithm.id, template: template.id }, {
      dailyLimits: {
        total: 2,
        untouched: { value: 1, counts: true },
        learn: { value: 10, counts: false },
        review: { value: 1, counts: true },
      },
      dayStartsAt: "05:00",
    });

    const cardA = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template, { "1": "Card A" }),
    });
    const cardB = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template, { "1": "Card B" }),
    });
    const cardC = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template, { "1": "Card C" }),
    });
    const boundary = new Date(2026, 0, 10, 5, 0, 0);

    await insertReview(db, {
      cardId: cardA.id,
      rating: 0,
      state: 0,
      dueAt: new Date(2026, 0, 10, 4, 0, 0),
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningSteps: 0,
      time: 200,
      isIgnored: false,
      createdAt: new Date(2026, 0, 9, 6, 0, 0),
    });
    await insertReview(db, {
      cardId: cardB.id,
      rating: 2,
      state: 1,
      dueAt: new Date(2026, 0, 10, 4, 30, 0),
      stability: 2,
      difficulty: 2,
      scheduledDays: 1,
      learningSteps: 1,
      time: 300,
      isIgnored: false,
      createdAt: new Date(2026, 0, 10, 4, 0, 0),
    });
    await insertReview(db, {
      cardId: cardC.id,
      rating: 3,
      state: 2,
      dueAt: new Date(2026, 0, 10, 4, 45, 0),
      stability: 3,
      difficulty: 2.5,
      scheduledDays: 2,
      learningSteps: 0,
      time: 400,
      isIgnored: false,
      createdAt: new Date(2026, 0, 10, 4, 15, 0),
    });
    await insertReview(db, {
      cardId: cardC.id,
      rating: 4,
      state: 2,
      dueAt: new Date(2026, 0, 10, 5, 30, 0),
      stability: 5,
      difficulty: 1.5,
      scheduledDays: 5,
      learningSteps: 0,
      time: 500,
      isIgnored: false,
      createdAt: new Date(2026, 0, 10, 5, 15, 0),
    });

    const result = await getTodaysReviewTotals(db);

    expect(boundary.getHours()).toBe(5);
    expect(result.reviewTotals).toEqual({
      untouched: 1,
      learn: 1,
      review: 1,
      total: 2,
    });
    expect(result.meta).toMatchObject({
      isLearnOverTheLimit: false,
      isTotalOverTheLimit: true,
      isUntouchedOverTheLimit: true,
      isReviewOverTheLimit: true,
    });
  });
});
