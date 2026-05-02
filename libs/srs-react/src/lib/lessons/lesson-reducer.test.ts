import type * as KolodaSrsModule from "@koloda/srs";
import { describe, expect, it, vi } from "vitest";
import { createCard, createLesson, createLessonData, createTodaysReviewTotals } from "../../test/test-helpers";
import { lessonReducer, lessonReducerDefault } from "./lesson-reducer";

const {
  getCardGradesMock,
  createCardFromCardFSRSMock,
  createReviewFromReviewFSRSMock,
} = vi.hoisted(() => ({
  getCardGradesMock: vi.fn(),
  createCardFromCardFSRSMock: vi.fn(),
  createReviewFromReviewFSRSMock: vi.fn(),
}));

vi.mock("@koloda/srs", async () => {
  const actual = await vi.importActual<typeof KolodaSrsModule>("@koloda/srs");

  return {
    ...actual,
    getCardGrades: getCardGradesMock,
    createCardFromCardFSRS: createCardFromCardFSRSMock,
    createReviewFromReviewFSRS: createReviewFromReviewFSRSMock,
  };
});

type LessonAction = Parameters<typeof lessonReducer>[1];

function reduceLesson(actions: LessonAction[]) {
  return actions.reduce(
    (state, action) => lessonReducer(state, action),
    structuredClone(lessonReducerDefault),
  );
}

describe("lessonReducer", () => {
  it("calculates total lesson amounts from per-type and total limits", () => {
    const state = reduceLesson([
      ["paramsSet", { type: "total" }],
      [
        "todayReviewTotalsReceived",
        createTodaysReviewTotals({
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
        }),
      ],
      ["lessonsReceived", [createLesson({
        untouched: 5,
        learn: 4,
        review: 8,
        total: 17,
      })]],
    ]);

    expect(state.amounts).toEqual({
      untouched: 2,
      learn: 1,
      review: 1,
      total: 4,
    });
  });

  it("clamps a single lesson type by the remaining total allowance", () => {
    const state = reduceLesson([
      ["paramsSet", { type: "review" }],
      [
        "todayReviewTotalsReceived",
        createTodaysReviewTotals({
          dailyLimits: {
            total: 2,
            review: { value: 10, counts: true },
          },
          reviewTotals: {
            review: 1,
          },
        }),
      ],
      ["lessonsReceived", [createLesson({
        review: 5,
        total: 5,
      })]],
    ]);

    expect(state.amounts).toEqual({
      untouched: 0,
      learn: 0,
      review: 1,
      total: 1,
    });
  });

  it("starts a lesson and tracks card form updates", () => {
    let state = reduceLesson([
      ["lessonDataReceived", createLessonData()],
    ]);

    expect(state.meta.isStarted).toBe(true);
    expect(state.content?.index).toBe(0);
    expect(state.content?.form.firstInputFieldId).toBe(2);
    expect(state.content?.form.isSubmitted).toBe(false);
    expect(state.progress).toEqual({
      done: { untouched: 0, learn: 0, review: 0, total: 0 },
      pending: { untouched: 1, learn: 0, review: 0, total: 1 },
    });

    state = lessonReducer(state, ["cardFormUpdated", { key: 2, value: "typed answer" }]);
    state = lessonReducer(state, ["cardSubmitted"]);

    expect(state.content?.form.data[2]).toBe("typed answer");
    expect(state.content?.form.isSubmitted).toBe(true);
  });

  it("queues a graded review, caps review time, and learns ahead when the next due card is near", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

    const learnedAheadCard = createCard({
      id: 2,
      state: 1,
      dueAt: new Date("2024-01-01T00:10:00.000Z"),
    });
    const grade = { card: { id: 10 }, log: { rating: 3 } } as any;

    getCardGradesMock.mockReturnValue([grade, grade, grade, grade]);
    createCardFromCardFSRSMock.mockReturnValue(learnedAheadCard);
    createReviewFromReviewFSRSMock.mockReturnValue({
      rating: 3,
      state: 1,
      dueAt: new Date("2024-01-01T00:10:00.000Z"),
      stability: 1,
      difficulty: 1,
      scheduledDays: 0,
      learningSteps: 1,
      time: 0,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    let state = reduceLesson([
      ["learnAheadLimitReceived", [0, 30]],
      [
        "lessonDataReceived",
        createLessonData({
          cards: [createCard({ id: 1 })],
        }),
      ],
    ]);

    vi.setSystemTime(new Date("2024-01-01T02:00:00.000Z"));
    state = lessonReducer(state, ["gradeSelected", 0]);

    expect(state.upload.queue).toHaveLength(1);
    expect(state.upload.queue[0]).toMatchObject({
      index: 0,
      card: learnedAheadCard,
      review: {
        cardId: 1,
        isIgnored: false,
        time: 60 * 60 * 1000,
      },
    });
    expect(state.data?.cards).toHaveLength(2);
    expect(state.content?.index).toBe(1);
    expect(state.content?.card.id).toBe(2);
    expect(state.progress).toEqual({
      done: { untouched: 1, learn: 0, review: 0, total: 1 },
      pending: { untouched: 0, learn: 1, review: 0, total: 1 },
    });
    expect(getCardGradesMock).toHaveBeenCalledTimes(2);
  });

  it("removes uploaded results from the queue and resets lesson state when closed", () => {
    let state = reduceLesson([
      ["paramsSet", { type: "untouched" }],
      ["todayReviewTotalsReceived", createTodaysReviewTotals()],
      ["lessonsReceived", [createLesson({ untouched: 1, total: 1 })]],
      ["lessonSubmitted"],
      ["lessonDataReceived", createLessonData()],
    ]);

    state = {
      ...state,
      upload: {
        ...state.upload,
        queue: [...state.upload.queue, {
          index: 0,
          card: createCard(),
          review: {
            cardId: 1,
            rating: 3,
            state: 1,
            dueAt: new Date("2024-01-01T00:10:00.000Z"),
            stability: 1,
            difficulty: 1,
            scheduledDays: 0,
            learningSteps: 1,
            time: 1000,
            isIgnored: false,
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
          },
        }],
      },
    };

    state = lessonReducer(state, ["resultUploaded", { index: 0, status: "success" }]);

    expect(state.upload.queue).toEqual([]);
    expect(state.upload.log).toEqual({ 0: "success" });

    state = lessonReducer(state, ["isOpenUpdated", false]);

    expect(state.meta).toEqual({
      isOpen: false,
      isSubmitted: undefined,
      isStarted: undefined,
      isFinished: undefined,
      isTerminationRequested: false,
    });
    expect(state.params).toBeUndefined();
    expect(state.lessons).toBeUndefined();
    expect(state.todayReviewTotals).toBeUndefined();
    expect(state.amounts).toBeUndefined();
    expect(state.data).toBeUndefined();
    expect(state.content).toBeUndefined();
    expect(state.upload).toEqual({
      queue: [],
      log: {},
    });
  });
});
