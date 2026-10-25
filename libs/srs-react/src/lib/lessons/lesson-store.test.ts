import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { createLessonData, createLessonsResult, createTodaysReviewTotals, testId } from "../../test/test-helpers";
import {
  initializeLessonAtom,
  lessonAtom,
  openLessonAtom,
  receiveLessonDataAtom,
  submitLessonSetupAtom,
} from "./lesson-actions";
import { lessonReducerDefault } from "./lesson-reducer";
import { lessonHasSessionAtom, lessonIsOpenAtom, lessonPhaseAtom, lessonRequestAtom } from "./lesson-selectors";
import { lessonStateAtom } from "./lesson-store";

const TOTAL_LESSONS = createLessonsResult({
  total: {
    untouched: 5,
    learn: 4,
    review: 8,
    total: 17,
  },
});

const TOTAL_TODAY_REVIEW_TOTALS = createTodaysReviewTotals({
  dailyLimits: {
    total: 6,
    untouched: { value: 3, counts: true },
    learn: { value: 2, counts: true },
    review: { value: 4, counts: false },
  },
  reviewTotals: {
    untouched: 1,
    learn: 1,
    review: 3,
  },
});

const REQUEST = { type: "total" as const, deckId: testId(7) };

function initializePayload(request = REQUEST) {
  return {
    request,
    learnAheadLimit: [0, 30] as [number, number],
    lessons: TOTAL_LESSONS,
    todayReviewTotals: TOTAL_TODAY_REVIEW_TOTALS,
  };
}

describe("lessonAtom launch", () => {
  it("writes a request through open and reads it back", () => {
    const store = createStore();

    store.set(lessonAtom, REQUEST);

    expect(store.get(lessonAtom)).toEqual(REQUEST);
    expect(store.get(lessonRequestAtom)).toEqual(REQUEST);
    expect(store.get(lessonPhaseAtom)).toBe("preparing");
    expect(store.get(lessonIsOpenAtom)).toBe(true);
  });

  it("writes null through close", () => {
    const store = createStore();
    store.set(lessonAtom, REQUEST);
    store.set(initializeLessonAtom, initializePayload());

    store.set(lessonAtom, null);

    expect(store.get(lessonAtom)).toBeNull();
    expect(store.get(lessonStateAtom)).toEqual(lessonReducerDefault);
  });
});

describe("lesson command atoms", () => {
  it("preserves identity for open while already open", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    const preparing = store.get(lessonStateAtom);

    store.set(openLessonAtom, { type: "review", deckId: testId(3) });

    expect(store.get(lessonStateAtom)).toBe(preparing);
    expect(store.get(lessonRequestAtom)).toEqual(REQUEST);
  });
});

describe("lesson selectors", () => {
  it("reports session presence after lesson data is received", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    store.set(initializeLessonAtom, initializePayload());
    expect(store.get(lessonHasSessionAtom)).toBe(false);

    store.set(submitLessonSetupAtom);
    expect(store.get(lessonHasSessionAtom)).toBe(false);

    store.set(receiveLessonDataAtom, createLessonData());
    expect(store.get(lessonHasSessionAtom)).toBe(true);
    expect(store.get(lessonPhaseAtom)).toBe("studying");
  });
});
