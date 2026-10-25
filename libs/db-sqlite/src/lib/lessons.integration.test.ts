import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCard, getCards } from "./cards";
import { updateDeck } from "./decks";
import { getLessonCards, getLessons, getLessonData, submitLessonResult } from "./lessons";
import { getReviews } from "./reviews";
import type { TestDb } from "../test/test-helpers";
import { createCardContent, createTestDb, seedDeck, seedDeckContext, seedTemplate } from "../test/test-helpers";

describe("lessons repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await testDb.close();
  });

  function getLessonCounts(lesson: {
    untouched: number | string;
    learn: number | string;
    review: number | string;
    total: number | string;
  }) {
    return {
      untouched: Number(lesson.untouched),
      learn: Number(lesson.learn),
      review: Number(lesson.review),
      total: Number(lesson.total),
    };
  }

  it("aggregates lesson counts by due status and deck filters", async () => {
    const { db } = testDb;
    const deckContextA = await seedDeckContext(db, { deck: { title: "Deck A" } });
    const deckContextB = await seedDeckContext(db, { deck: { title: "Deck B" } });
    const dueAt = new Date("2026-01-10T12:00:00.000Z");

    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 0,
    });
    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 1,
      dueAt: new Date("2026-01-10T11:00:00.000Z"),
    });
    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 1,
      dueAt: new Date("2026-01-10T13:00:00.000Z"),
    });
    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 2,
      dueAt: new Date("2026-01-10T10:00:00.000Z"),
    });
    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 2,
      dueAt: new Date("2026-01-10T14:00:00.000Z"),
    });
    await addCard(db, {
      deckId: deckContextB.deck.id,
      templateId: deckContextB.template.id,
      content: createCardContent(deckContextB.template),
      state: 2,
      dueAt: new Date("2026-01-10T09:00:00.000Z"),
    });

    const lessons = await getLessons(db, dueAt);
    const filteredLessons = await getLessons(db, dueAt, { deckIds: [deckContextA.deck.id] });

    expect(getLessonCounts(lessons.total)).toMatchObject({
      untouched: 1,
      learn: 1,
      review: 2,
      total: 4,
    });
    expect({
      title: lessons.decks.find((lesson) => lesson.id === deckContextA.deck.id)?.title,
      ...getLessonCounts(lessons.decks.find((lesson) => lesson.id === deckContextA.deck.id)!),
    }).toMatchObject({
      title: "Deck A",
      untouched: 1,
      learn: 1,
      review: 1,
      total: 3,
    });
    expect({
      title: lessons.decks.find((lesson) => lesson.id === deckContextB.deck.id)?.title,
      ...getLessonCounts(lessons.decks.find((lesson) => lesson.id === deckContextB.deck.id)!),
    }).toMatchObject({
      title: "Deck B",
      untouched: 0,
      learn: 0,
      review: 1,
      total: 1,
    });
    expect(getLessonCounts(filteredLessons.total)).toMatchObject({
      untouched: 1,
      learn: 1,
      review: 1,
      total: 3,
    });
  });

  // Twin of Rust `get_lesson_cards_applies_limits_due_at_and_deck_filters`.
  it("draws new cards oldest first, then the soonest due learn and review cards, within the deck filter", async () => {
    const { db } = testDb;
    const { deck, template, algorithm } = await seedDeckContext(db);
    const otherDeck = await seedDeck(db, { algorithmId: algorithm.id, templateId: template.id });
    vi.useFakeTimers({ toFake: ["Date"] });

    async function addCardAt(createdAt: number, deckId: string, state: number, dueAt?: number) {
      vi.setSystemTime(createdAt);
      const card = await addCard(db, {
        deckId,
        templateId: template.id,
        content: createCardContent(template),
        state,
        dueAt: dueAt === undefined ? undefined : new Date(dueAt),
      });
      return card.id;
    }

    const untouchedFirst = await addCardAt(10, deck.id, 0);
    await addCardAt(20, deck.id, 0);
    const learnEarliestDue = await addCardAt(30, deck.id, 1, 800);
    await addCardAt(40, deck.id, 1, 900);
    await addCardAt(50, deck.id, 1, 1_100);
    const reviewEarliestDue = await addCardAt(60, deck.id, 2, 700);
    await addCardAt(70, deck.id, 2, 1_200);
    await addCardAt(80, otherDeck.id, 0);
    await addCardAt(90, otherDeck.id, 1, 600);
    await addCardAt(100, otherDeck.id, 2, 500);

    const cards = await getLessonCards(
      db,
      new Date(1_000),
      { deckIds: [deck.id] },
      { untouched: 1, learn: 1, review: 1, total: 3 },
    );

    expect(cards.map(({ id }) => id)).toEqual([untouchedFirst, learnEarliestDue, reviewEarliestDue]);
    expect(cards.every(({ deckId }) => deckId === deck.id)).toBe(true);
  });

  // Twin of Rust `get_lesson_cards_treats_state_three_as_learn`.
  it("draws due relearning cards as learn", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const relearningDue = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 3,
      dueAt: new Date(900),
    });
    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 3,
      dueAt: new Date(1_100),
    });

    const cards = await getLessonCards(
      db,
      new Date(1_000),
      { deckIds: [deck.id] },
      { untouched: 0, learn: 1, review: 0, total: 1 },
    );

    expect(cards.map(({ id, state }) => ({ id, state }))).toEqual([{ id: relearningDue.id, state: 3 }]);
  });

  it("assembles lesson cards, decks, templates, and algorithms together", async () => {
    const { db } = testDb;
    const deckContextA = await seedDeckContext(db, { deck: { title: "Deck A" } });
    const deckContextB = await seedDeckContext(db, { deck: { title: "Deck B" } });
    const dueAt = new Date("2026-01-10T12:00:00.000Z");

    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 0,
    });
    await addCard(db, {
      deckId: deckContextA.deck.id,
      templateId: deckContextA.template.id,
      content: createCardContent(deckContextA.template),
      state: 2,
      dueAt: new Date("2026-01-10T08:00:00.000Z"),
    });
    await addCard(db, {
      deckId: deckContextB.deck.id,
      templateId: deckContextB.template.id,
      content: createCardContent(deckContextB.template),
      state: 1,
      dueAt: new Date("2026-01-10T09:00:00.000Z"),
    });

    const lessonData = await getLessonData(
      db,
      dueAt,
      {
        deckIds: [deckContextA.deck.id, deckContextB.deck.id],
      },
      {
        untouched: 1,
        learn: 1,
        review: 1,
        total: 3,
      },
    );

    expect(lessonData).not.toBeNull();
    expect(lessonData?.cards).toHaveLength(3);
    expect(lessonData?.decks.map((deck) => deck.id).sort()).toEqual(
      [deckContextA.deck.id, deckContextB.deck.id].sort(),
    );
    expect(lessonData?.templates).toHaveLength(2);
    expect(lessonData?.algorithms).toHaveLength(2);
    expect(lessonData?.templates.every((template) => template.layout.every((item) => item.field !== undefined))).toBe(
      true,
    );
    // Wire shape twin: lesson data carries slim DTOs on both hosts. Rust pins the same keys in
    // lessons_serde_tests / lessons_integration_tests.
    expect(Object.keys(lessonData?.templates[0] ?? {}).sort()).toEqual(["id", "layout"]);
    expect(Object.keys(lessonData?.templates[0]?.layout[0] ?? {}).sort()).toEqual(["field", "fieldId", "operation"]);
    expect(Object.keys(lessonData?.algorithms[0] ?? {}).sort()).toEqual(["content", "id"]);
  });

  it("carries each card's own template after its deck switches to another", async () => {
    const { db } = testDb;
    const { deck, template: cardTemplate, algorithm } = await seedDeckContext(db);
    await addCard(db, {
      deckId: deck.id,
      templateId: cardTemplate.id,
      content: createCardContent(cardTemplate),
      state: 0,
    });
    const deckTemplate = await seedTemplate(db, { title: "Other" });
    await updateDeck(db, {
      id: deck.id,
      values: { title: deck.title, algorithmId: algorithm.id, templateId: deckTemplate.id },
    });

    const lessonData = await getLessonData(
      db,
      new Date("2026-01-10T12:00:00.000Z"),
      { deckIds: [deck.id] },
      { untouched: 1, learn: 0, review: 0, total: 1 },
    );

    expect(lessonData?.templates.map(({ id }) => id)).toEqual([cardTemplate.id]);
  });

  it("returns null when no cards match requested amounts", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 0,
    });

    const lessonData = await getLessonData(
      db,
      new Date("2026-01-10T12:00:00.000Z"),
      { deckIds: [deck.id] },
      { untouched: 0, learn: 0, review: 0, total: 0 },
    );

    expect(lessonData).toBeNull();
  });

  it("rejects negative lesson amounts", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 0,
    });

    await expect(
      getLessonCards(
        db,
        new Date("2026-01-10T12:00:00.000Z"),
        { deckIds: [deck.id] },
        { untouched: -1, learn: 0, review: 0, total: 0 },
      ),
    ).rejects.toMatchObject({ code: "validation.lessons.amounts.negative" });
  });

  it("stores the updated card and review when a lesson result is submitted", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    // INVARIANT: `InsertReviewData` carries no `createdAt` — the repo stamps the submit
    // time, mirroring Rust `insert_review(_, _, now)`.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));
    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 0,
    });
    const updatedCard = {
      id: card.id,
      state: 2,
      dueAt: new Date("2026-01-12T12:00:00.000Z"),
      stability: 4.5,
      difficulty: 2.25,
      scheduledDays: 2,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      lastReviewedAt: new Date("2026-01-10T12:00:00.000Z"),
    };
    const review = {
      cardId: card.id,
      rating: 3,
      state: 2,
      dueAt: new Date("2026-01-12T12:00:00.000Z"),
      stability: 4.5,
      difficulty: 2.25,
      scheduledDays: 2,
      learningSteps: 0,
      time: 1250,
      isIgnored: false,
    };

    await submitLessonResult(db, { card: updatedCard, review });
    const storedCards = await getCards(db, { deckId: deck.id });
    const storedCard = storedCards.find((item) => item.id === card.id);
    const storedReviews = await getReviews(db, { cardId: card.id });

    expect(storedCard).toMatchObject({
      id: card.id,
      state: 2,
      scheduledDays: 2,
      reps: 1,
      lastReviewedAt: updatedCard.lastReviewedAt,
    });
    expect(storedReviews).toHaveLength(1);
    expect(storedReviews[0]).toMatchObject(review);
    expect(storedReviews[0]?.createdAt).toEqual(new Date("2026-01-10T12:00:00.000Z"));
  });

  // Twin of Rust `submit_lesson_result_rolls_back_when_review_insert_fails`.
  it("rolls back the card update when the review insert fails", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 0,
    });
    // WHY: a valid result cannot fail the insert on its own; the trigger fails it inside the transaction,
    // after the card update ran.
    await db.run(`CREATE TRIGGER fail_review_insert BEFORE INSERT ON reviews BEGIN SELECT RAISE(ABORT, 'forced'); END`);

    await expect(
      submitLessonResult(db, {
        card: {
          id: card.id,
          state: 2,
          dueAt: new Date("2026-01-12T12:00:00.000Z"),
          stability: 4.5,
          difficulty: 2.25,
          scheduledDays: 2,
          learningSteps: 0,
          reps: 1,
          lapses: 0,
          lastReviewedAt: new Date("2026-01-10T12:00:00.000Z"),
        },
        review: {
          cardId: card.id,
          rating: 3,
          state: 2,
          dueAt: new Date("2026-01-12T12:00:00.000Z"),
          stability: 4.5,
          difficulty: 2.25,
          scheduledDays: 2,
          learningSteps: 0,
          time: 1250,
          isIgnored: false,
        },
      }),
    ).rejects.toMatchObject({ code: "db.update" });

    const [storedCard] = await getCards(db, { deckId: deck.id });
    expect(storedCard).toMatchObject({ id: card.id, state: 0, reps: 0, dueAt: null });
    expect(await getReviews(db, { cardId: card.id })).toHaveLength(0);
  });

  it("rejects out-of-bounds progress and persists nothing", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 0,
    });
    const updatedCard = {
      id: card.id,
      state: 2,
      dueAt: new Date("2026-01-12T12:00:00.000Z"),
      stability: 4.5,
      difficulty: 11,
      scheduledDays: 2,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      lastReviewedAt: new Date("2026-01-10T12:00:00.000Z"),
    };
    const review = {
      cardId: card.id,
      rating: 3,
      state: 2,
      dueAt: new Date("2026-01-12T12:00:00.000Z"),
      stability: 4.5,
      difficulty: 2.25,
      scheduledDays: 2,
      learningSteps: 0,
      time: 1250,
      isIgnored: false,
    };

    // Twin of desktop `submit_lesson_result_rejects_invalid_progress`: the zod issue
    // message carries the same AppError-catalog code desktop puts on the error.
    await expect(submitLessonResult(db, { card: updatedCard, review })).rejects.toMatchObject({
      issues: [{ message: "validation.cards-progress.difficulty" }],
    });

    const storedCards = await getCards(db, { deckId: deck.id });
    expect(storedCards).toHaveLength(1);
    expect(storedCards[0]).toMatchObject({ id: card.id, state: 0, reps: 0 });
    expect(await getReviews(db, { cardId: card.id })).toHaveLength(0);
  });
});
