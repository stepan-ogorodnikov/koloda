import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "../test/test-helpers";
import {
  createCardContent,
  createTestDb,
  insertReview,
  seedDeckContext,
  seedLearningSettings,
} from "../test/test-helpers";
import { addCard } from "./cards";
import { getTodaysReviewTotals } from "./reviews";
import { getSettings, patchSettings, setSettings } from "./settings";

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

  it("deletes a patched null key so the schema default refills, like desktop RFC 7386", async () => {
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
          learn: { value: null },
        },
      },
    });

    // Twin: patch_settings_deletes_null_keys_so_schema_defaults_refill
    // (crates/koloda/tests/integration/settings_integration_tests.rs). A patched
    // null deletes `value`; the learn default (0) refills while `counts` survives.
    expect(result.content).toMatchObject({
      dailyLimits: {
        total: 40,
        learn: { value: 0, counts: false },
        untouched: { value: 10, counts: true },
        review: { value: 20, counts: true },
      },
    });
  });

  it("replaces arrays wholesale instead of element-merging, like desktop RFC 7386", async () => {
    const { db } = testDb;

    await setSettings(db, {
      name: "ai",
      content: {
        profiles: [
          {
            id: "01900000-0000-7000-8000-000000000001",
            title: "First",
            whitelistModelIds: ["openai/gpt-4"],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { id: "01900000-0000-7000-8000-000000000002", title: "Second", createdAt: "2026-01-02T00:00:00.000Z" },
        ],
      },
    });

    const result = await patchSettings(db, {
      name: "ai",
      content: {
        profiles: [
          { id: "01900000-0000-7000-8000-000000000001", title: "Renamed", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      },
    });

    // Twin: patch_settings_replaces_arrays_wholesale
    // (crates/koloda/tests/integration/settings_integration_tests.rs). The whole
    // array is replaced — one profile, and fields the patch omits do not survive.
    expect(result.content.profiles).toHaveLength(1);
    expect(result.content.profiles[0]).toMatchObject({
      id: "01900000-0000-7000-8000-000000000001",
      title: "Renamed",
    });
    expect(result.content.profiles[0]).not.toHaveProperty("whitelistModelIds");
  });

  it("returns normalized settings content with schema defaults applied", async () => {
    const { db } = testDb;

    await db.run("INSERT INTO settings (name, content, created_at) VALUES (?, ?, ?)", [
      "interface",
      JSON.stringify({ language: "ru" }),
      Date.now(),
    ]);

    const result = await getSettings(db, "interface");

    expect(result?.content).toEqual({
      language: "ru",
      scheme: "system",
      lightTheme: "github-light",
      darkTheme: "github-dark",
      motion: "system",
      dateFormat: "locale",
      timeFormat: "locale",
    });
  });

  it("throws db.get instead of returning null when stored learning content is invalid", async () => {
    const { db } = testDb;

    await db.run("INSERT INTO settings (name, content, created_at) VALUES (?, ?, ?)", [
      "learning",
      JSON.stringify({ dayStartsAt: 42 }),
      Date.now(),
    ]);

    await expect(getSettings(db, "learning")).rejects.toMatchObject({ code: "db.get" });
  });

  it("throws db.get for today's totals when learning settings are absent", async () => {
    const { db } = testDb;

    await expect(getTodaysReviewTotals(db)).rejects.toMatchObject({ code: "db.get" });
  });

  it("throws db.get for today's totals when stored learning content is invalid", async () => {
    const { db } = testDb;

    await db.run("INSERT INTO settings (name, content, created_at) VALUES (?, ?, ?)", [
      "learning",
      JSON.stringify({ dayStartsAt: 42 }),
      Date.now(),
    ]);

    await expect(getTodaysReviewTotals(db)).rejects.toMatchObject({ code: "db.get" });
  });

  it("calculates today's review totals using the learning day boundary and counts flags", async () => {
    const { db } = testDb;
    const { algorithm, template, deck } = await seedDeckContext(db);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 10, 4, 30, 0));

    await seedLearningSettings(
      db,
      { algorithm: algorithm.id, template: template.id },
      {
        dailyLimits: {
          total: 2,
          untouched: { value: 1, counts: true },
          learn: { value: 10, counts: false },
          review: { value: 1, counts: true },
        },
        dayStartsAt: "05:00",
      },
    );

    const frontId = template.content.fields[0]!.id;
    const cardA = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template, { [frontId]: "Card A" }),
    });
    const cardB = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template, { [frontId]: "Card B" }),
    });
    const cardC = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template, { [frontId]: "Card C" }),
    });
    const boundary = new Date(2026, 0, 10, 5, 0, 0);

    await insertReview(db, {
      cardId: cardA.id,
      rating: 1,
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
      dueAt: new Date(2026, 0, 10, 8, 0, 0),
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
      dueAt: new Date(2026, 0, 10, 12, 0, 0),
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
