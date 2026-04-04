import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCard, getCards } from "./cards";
import { getLessons, getLessonData, submitLessonResult } from "./lessons";
import { getReviews } from "./reviews";
import type { TestDb } from "../test/test-helpers";
import { createCardContent, createTestDb, seedDeckContext } from "../test/test-helpers";

describe("lessons repository integration", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
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

    expect({ id: lessons[0]?.id, ...getLessonCounts(lessons[0]!) }).toMatchObject({
      id: null,
      untouched: 1,
      learn: 1,
      review: 2,
      total: 4,
    });
    expect({
      title: lessons.find((lesson) => lesson.id === deckContextA.deck.id)?.title,
      ...getLessonCounts(lessons.find((lesson) => lesson.id === deckContextA.deck.id)!),
    }).toMatchObject({
      title: "Deck A",
      untouched: 1,
      learn: 1,
      review: 1,
      total: 3,
    });
    expect({
      title: lessons.find((lesson) => lesson.id === deckContextB.deck.id)?.title,
      ...getLessonCounts(lessons.find((lesson) => lesson.id === deckContextB.deck.id)!),
    }).toMatchObject({
      title: "Deck B",
      untouched: 0,
      learn: 0,
      review: 1,
      total: 1,
    });
    expect({ id: filteredLessons[0]?.id, ...getLessonCounts(filteredLessons[0]!) }).toMatchObject({
      id: null,
      untouched: 1,
      learn: 1,
      review: 1,
      total: 3,
    });
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

    const lessonData = await getLessonData(db, dueAt, {
      deckIds: [deckContextA.deck.id, deckContextB.deck.id],
    }, {
      untouched: 1,
      learn: 1,
      review: 1,
      total: 3,
    });

    expect(lessonData).not.toBeNull();
    expect(lessonData?.cards).toHaveLength(3);
    expect(lessonData?.decks.map((deck) => deck.id).sort((a, b) => a - b)).toEqual([
      deckContextA.deck.id,
      deckContextB.deck.id,
    ].sort((a, b) => a - b));
    expect(lessonData?.templates).toHaveLength(2);
    expect(lessonData?.algorithms).toHaveLength(2);
    expect(lessonData?.templates.every((template) => (
      template.layout.every((item) => item.field !== undefined)
    ))).toBe(true);
  });

  it("stores the updated card and review when a lesson result is submitted", async () => {
    const { db } = testDb;
    const { deck, template } = await seedDeckContext(db);
    const card = await addCard(db, {
      deckId: deck.id,
      templateId: template.id,
      content: createCardContent(template),
      state: 0,
    });
    const updatedCard = {
      ...card,
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
      createdAt: new Date("2026-01-10T12:00:00.000Z"),
    };

    const insertedReview = await submitLessonResult(db, { card: updatedCard, review });
    const storedCards = await getCards(db, { deckId: deck.id });
    const storedCard = storedCards.find((item) => item.id === card.id);
    const storedReviews = await getReviews(db, { cardId: card.id });

    expect(insertedReview).toMatchObject(review);
    expect(storedCard).toMatchObject({
      id: card.id,
      state: 2,
      scheduledDays: 2,
      reps: 1,
      lastReviewedAt: updatedCard.lastReviewedAt,
    });
    expect(storedReviews).toHaveLength(1);
    expect(storedReviews[0]).toMatchObject(review);
  });
});
