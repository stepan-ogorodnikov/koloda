import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { createLessonsResult, createTodaysReviewTotals } from "../../test/test-helpers";
import {
  closeLessonStateAtom,
  initializeLessonAtom,
  lessonAtom,
  openLessonAtom,
  updateLessonAmountAtom,
} from "./lesson-actions";
import { lessonReducerDefault } from "./lesson-reducer";
import {
  lessonAmountsAtom,
  lessonAvailableAtom,
  lessonContentAtom,
  lessonIsOpenAtom,
  lessonPhaseAtom,
  lessonProgressAtom,
  lessonRequestAtom,
  lessonSessionCardsAtom,
  lessonSetupAtom,
  lessonTerminationRequestedAtom,
  lessonUploadHeadAtom,
  lessonUploadLogAtom,
} from "./lesson-selectors";
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

const TOTAL_EXPECTED_AMOUNTS = {
  untouched: 2,
  learn: 1,
  review: 1,
  total: 4,
};

const REQUEST = { type: "total" as const, deckId: 7 };

function initializePayload(request = REQUEST) {
  return {
    request,
    learnAheadLimit: [0, 30] as [number, number],
    lessons: TOTAL_LESSONS,
    todayReviewTotals: TOTAL_TODAY_REVIEW_TOTALS,
  };
}

describe("lessonAtom compatibility", () => {
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
  it("opens into preparing, then initialize configures amounts", () => {
    const store = createStore();

    store.set(openLessonAtom, REQUEST);
    expect(store.get(lessonPhaseAtom)).toBe("preparing");
    expect(store.get(lessonRequestAtom)).toEqual(REQUEST);

    store.set(initializeLessonAtom, initializePayload());
    expect(store.get(lessonPhaseAtom)).toBe("configuring");
    expect(store.get(lessonAmountsAtom)).toEqual(TOTAL_EXPECTED_AMOUNTS);
  });

  it("edits amounts while configuring", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    store.set(initializeLessonAtom, initializePayload());

    store.set(updateLessonAmountAtom, { type: "untouched", value: 1 });

    expect(store.get(lessonAmountsAtom)).toEqual({ ...TOTAL_EXPECTED_AMOUNTS, untouched: 1, total: 3 });
  });

  it("does not overwrite an amount edit with repeated initialize", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    store.set(initializeLessonAtom, initializePayload());
    store.set(updateLessonAmountAtom, { type: "untouched", value: 1 });
    const afterEdit = store.get(lessonStateAtom);

    store.set(initializeLessonAtom, {
      ...initializePayload(),
      learnAheadLimit: [1, 0],
    });

    expect(store.get(lessonStateAtom)).toBe(afterEdit);
    expect(store.get(lessonAmountsAtom)).toEqual({ ...TOTAL_EXPECTED_AMOUNTS, untouched: 1, total: 3 });
  });

  it("preserves identity for open while already open", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    const preparing = store.get(lessonStateAtom);

    store.set(openLessonAtom, { type: "review", deckId: 3 });

    expect(store.get(lessonStateAtom)).toBe(preparing);
    expect(store.get(lessonRequestAtom)).toEqual(REQUEST);
  });

  it("closes and resets every session field", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    store.set(initializeLessonAtom, initializePayload());
    store.set(updateLessonAmountAtom, { type: "learn", value: 0 });

    store.set(closeLessonStateAtom);

    const state = store.get(lessonStateAtom);
    expect(state).toEqual(lessonReducerDefault);
    expect(state.phase).toBe("closed");
    expect(state.request).toBeNull();
    expect(state.setup).toBeNull();
    expect(state.session).toBeNull();
    expect(state.isTerminationRequested).toBe(false);
    expect(state.upload).toEqual({ queue: [], log: {} });
    expect(store.get(lessonIsOpenAtom)).toBe(false);
    expect(store.get(lessonContentAtom)).toBeUndefined();
    expect(store.get(lessonProgressAtom)).toBeUndefined();
    expect(store.get(lessonUploadHeadAtom)).toBeUndefined();
    expect(store.get(lessonUploadLogAtom)).toEqual({});
  });
});

describe("lesson selectors", () => {
  it("exposes the expected slices after initialize", () => {
    const store = createStore();
    store.set(openLessonAtom, REQUEST);
    store.set(initializeLessonAtom, initializePayload());

    expect(store.get(lessonPhaseAtom)).toBe("configuring");
    expect(store.get(lessonIsOpenAtom)).toBe(true);
    expect(store.get(lessonRequestAtom)).toEqual(REQUEST);
    expect(store.get(lessonSetupAtom)).toMatchObject({
      filters: { deckIds: [7] },
      available: TOTAL_LESSONS.total,
      reviewTotals: TOTAL_TODAY_REVIEW_TOTALS.reviewTotals,
      dailyLimits: TOTAL_TODAY_REVIEW_TOTALS.dailyLimits,
      amounts: TOTAL_EXPECTED_AMOUNTS,
      learnAheadLimit: [0, 30],
    });
    expect(store.get(lessonAmountsAtom)).toEqual(TOTAL_EXPECTED_AMOUNTS);
    expect(store.get(lessonAvailableAtom)).toEqual(TOTAL_LESSONS.total);
    expect(store.get(lessonContentAtom)).toBeUndefined();
    expect(store.get(lessonSessionCardsAtom)).toBeUndefined();
    expect(store.get(lessonProgressAtom)).toBeUndefined();
    expect(store.get(lessonTerminationRequestedAtom)).toBe(false);
    expect(store.get(lessonUploadHeadAtom)).toBeUndefined();
    expect(store.get(lessonUploadLogAtom)).toEqual({});
  });
});
