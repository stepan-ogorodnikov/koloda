import type { LearningSettings } from "@koloda/app";
import type * as KolodaSrsModule from "@koloda/srs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCard, createLessonData, createLessonsResult, createTodaysReviewTotals } from "../../test/test-helpers";
import { calculateInitialLessonAmounts, lessonReducer, lessonReducerDefault } from "./lesson-reducer";
import type { LessonReducerState } from "./lesson-reducer";

const { getCardGradesMock, createCardFromCardFSRSMock, createReviewFromReviewFSRSMock } = vi.hoisted(() => ({
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

const REVIEW_LESSONS = createLessonsResult({
  total: {
    review: 5,
    total: 5,
  },
});

const REVIEW_TODAY_REVIEW_TOTALS = createTodaysReviewTotals({
  dailyLimits: {
    total: 2,
    review: { value: 10, counts: true },
  },
  reviewTotals: {
    review: 1,
  },
});

const REVIEW_EXPECTED_AMOUNTS = {
  untouched: 0,
  learn: 0,
  review: 1,
  total: 1,
};

function reduceLesson(actions: LessonAction[], initial: LessonReducerState = structuredClone(lessonReducerDefault)) {
  return actions.reduce((state, action) => lessonReducer(state, action), initial);
}

function startLesson(options?: {
  request?: { type: "total" | "untouched" | "learn" | "review"; deckId?: number | null };
  learnAheadLimit?: LearningSettings["learnAheadLimit"];
  lessons?: ReturnType<typeof createLessonsResult>;
  todayReviewTotals?: ReturnType<typeof createTodaysReviewTotals>;
  shouldSubmitSetup?: boolean;
  lessonData?: ReturnType<typeof createLessonData>;
}) {
  const request = options?.request ?? { type: "total" as const };
  const actions: LessonAction[] = [
    ["open", request],
    [
      "initialize",
      {
        request,
        learnAheadLimit: options?.learnAheadLimit,
        lessons: options?.lessons ?? TOTAL_LESSONS,
        todayReviewTotals: options?.todayReviewTotals ?? TOTAL_TODAY_REVIEW_TOTALS,
      },
    ],
  ];

  if (options?.shouldSubmitSetup || options?.lessonData) {
    actions.push(["setupSubmitted"]);
  }

  if (options?.lessonData) {
    actions.push(["lessonDataReceived", options.lessonData]);
  }

  return reduceLesson(actions);
}

function queuedUploadItem() {
  return {
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
  };
}

afterEach(() => {
  vi.useRealTimers();
  getCardGradesMock.mockReset();
  createCardFromCardFSRSMock.mockReset();
  createReviewFromReviewFSRSMock.mockReset();
});

describe("lessonReducer", () => {
  it("opens a closed lesson into preparing, then initialize moves to configuring", () => {
    const request = { type: "total" as const, deckId: 7 };
    let state = lessonReducer(structuredClone(lessonReducerDefault), ["open", request]);

    expect(state.phase).toBe("preparing");
    expect(state.request).toEqual(request);
    expect(state.setup).toBeNull();

    state = lessonReducer(state, [
      "initialize",
      {
        request,
        learnAheadLimit: [0, 30],
        lessons: TOTAL_LESSONS,
        todayReviewTotals: TOTAL_TODAY_REVIEW_TOTALS,
      },
    ]);

    expect(state.phase).toBe("configuring");
    expect(state.setup?.filters).toEqual({ deckIds: [7] });
    expect(state.setup?.learnAheadLimit).toEqual([0, 30]);
  });

  it("initializes total lesson amounts from complete setup input", () => {
    const state = startLesson();

    expect(state.phase).toBe("configuring");
    expect(state.setup?.amounts).toEqual(TOTAL_EXPECTED_AMOUNTS);
    expect(state.setup?.available).toEqual(TOTAL_LESSONS.total);
    expect(state.setup?.reviewTotals).toEqual(TOTAL_TODAY_REVIEW_TOTALS.reviewTotals);
    expect(state.setup?.dailyLimits).toEqual(TOTAL_TODAY_REVIEW_TOTALS.dailyLimits);
  });

  it("initializes a single lesson type clamped by the remaining total allowance", () => {
    const state = startLesson({
      request: { type: "review" },
      lessons: REVIEW_LESSONS,
      todayReviewTotals: REVIEW_TODAY_REVIEW_TOTALS,
    });

    expect(state.phase).toBe("configuring");
    expect(state.setup?.amounts).toEqual(REVIEW_EXPECTED_AMOUNTS);
  });

  it("treats repeated initialize and mismatched request as no-ops", () => {
    const request = { type: "total" as const };
    let state = startLesson({ request });
    state = lessonReducer(state, ["amountUpdated", { type: "untouched", value: 1 }]);
    const afterEdit = state;

    const repeated = lessonReducer(state, [
      "initialize",
      {
        request,
        learnAheadLimit: [1, 0],
        lessons: TOTAL_LESSONS,
        todayReviewTotals: TOTAL_TODAY_REVIEW_TOTALS,
      },
    ]);
    expect(repeated).toBe(afterEdit);
    expect(repeated.setup?.amounts).toEqual({ ...TOTAL_EXPECTED_AMOUNTS, untouched: 1, total: 3 });

    const preparing = lessonReducer(structuredClone(lessonReducerDefault), ["open", request]);
    const mismatched = lessonReducer(preparing, [
      "initialize",
      {
        request: { type: "review", deckId: 2 },
        learnAheadLimit: [0, 30],
        lessons: REVIEW_LESSONS,
        todayReviewTotals: REVIEW_TODAY_REVIEW_TOTALS,
      },
    ]);
    expect(mismatched).toBe(preparing);
    expect(mismatched.phase).toBe("preparing");
    expect(mismatched.setup).toBeNull();
  });

  it("edits amounts only while configuring", () => {
    let state = startLesson();
    state = lessonReducer(state, ["amountUpdated", { type: "learn", value: 0 }]);

    expect(state.setup?.amounts).toEqual({ ...TOTAL_EXPECTED_AMOUNTS, learn: 0, total: 3 });

    const loading = lessonReducer(state, ["setupSubmitted"]);
    const ignored = lessonReducer(loading, ["amountUpdated", { type: "learn", value: 4 }]);
    expect(ignored).toBe(loading);
    expect(ignored.setup?.amounts.learn).toBe(0);
  });

  it("rejects setupSubmitted when the total is zero and otherwise enters loading-cards", () => {
    const zero = startLesson({
      lessons: createLessonsResult(),
      todayReviewTotals: createTodaysReviewTotals(),
    });
    expect(zero.setup?.amounts.total).toBe(0);

    const blocked = lessonReducer(zero, ["setupSubmitted"]);
    expect(blocked).toBe(zero);
    expect(blocked.phase).toBe("configuring");

    const submitted = lessonReducer(startLesson(), ["setupSubmitted"]);
    expect(submitted.phase).toBe("loading-cards");
  });

  it("accepts lessonDataReceived only once during loading-cards, then studies with content", () => {
    const configuring = startLesson();
    const ignoredWhileConfiguring = lessonReducer(configuring, ["lessonDataReceived", createLessonData()]);
    expect(ignoredWhileConfiguring).toBe(configuring);

    const loading = lessonReducer(configuring, ["setupSubmitted"]);
    const studying = lessonReducer(loading, ["lessonDataReceived", createLessonData()]);

    expect(studying.phase).toBe("studying");
    expect(studying.session?.content?.index).toBe(0);
    expect(studying.session?.content?.form.firstInputFieldId).toBe(2);
    expect(studying.session?.content?.form.isSubmitted).toBe(false);
    expect(studying.session?.progress).toEqual({
      done: { untouched: 0, learn: 0, review: 0, total: 0 },
      pending: { untouched: 1, learn: 0, review: 0, total: 1 },
    });

    const repeated = lessonReducer(studying, ["lessonDataReceived", createLessonData({ cards: [] })]);
    expect(repeated).toBe(studying);
    expect(repeated.session?.data.cards).toHaveLength(1);
  });

  it("updates and submits the card form only while studying", () => {
    const loading = startLesson({ shouldSubmitSetup: true });
    const ignoredForm = lessonReducer(loading, ["cardFormUpdated", { key: 2, value: "too early" }]);
    const ignoredSubmit = lessonReducer(loading, ["cardSubmitted"]);
    expect(ignoredForm).toBe(loading);
    expect(ignoredSubmit).toBe(loading);

    let state = startLesson({ lessonData: createLessonData() });
    state = lessonReducer(state, ["cardFormUpdated", { key: 2, value: "typed answer" }]);
    state = lessonReducer(state, ["cardSubmitted"]);

    expect(state.session?.content?.form.data[2]).toBe("typed answer");
    expect(state.session?.content?.form.isSubmitted).toBe(true);
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

    let state = startLesson({
      learnAheadLimit: [0, 30],
      lessonData: createLessonData({
        cards: [createCard({ id: 1 })],
      }),
    });

    vi.setSystemTime(new Date("2024-01-01T02:00:00.000Z"));
    state = lessonReducer(state, ["gradeSelected", 0]);

    expect(state.phase).toBe("studying");
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
    expect(state.session?.data.cards).toHaveLength(2);
    expect(state.session?.content?.index).toBe(1);
    expect(state.session?.content?.card.id).toBe(2);
    expect(state.session?.progress).toEqual({
      done: { untouched: 1, learn: 0, review: 0, total: 1 },
      pending: { untouched: 0, learn: 1, review: 0, total: 1 },
    });
    expect(getCardGradesMock).toHaveBeenCalledTimes(2);
  });

  it("finishes the lesson when the last card is graded", () => {
    const grade = { card: { id: 10 }, log: { rating: 3 } } as any;
    getCardGradesMock.mockReturnValue([grade]);
    createCardFromCardFSRSMock.mockReturnValue(createCard({ id: 1, state: 2 }));
    createReviewFromReviewFSRSMock.mockReturnValue({
      rating: 3,
      state: 2,
      dueAt: new Date("2024-01-02T00:00:00.000Z"),
      stability: 1,
      difficulty: 1,
      scheduledDays: 1,
      learningSteps: 0,
      time: 0,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    let state = startLesson({ lessonData: createLessonData() });
    state = lessonReducer(state, ["gradeSelected", 0]);

    expect(state.phase).toBe("finished");
    expect(state.session?.content?.index).toBe(1);
    expect(state.session?.progress?.done.total).toBe(1);
    expect(state.session?.progress?.pending.total).toBe(0);
  });

  it("records and cancels a termination request", () => {
    let state = startLesson({ lessonData: createLessonData() });
    state = lessonReducer(state, ["terminationRequested", true]);
    expect(state.isTerminationRequested).toBe(true);
    expect(state.phase).toBe("studying");

    state = lessonReducer(state, ["terminationRequested", false]);
    expect(state.isTerminationRequested).toBe(false);
    expect(state.phase).toBe("studying");
  });

  it("resets completely on close and discards a queued upload", () => {
    let state = startLesson({ lessonData: createLessonData() });
    state = {
      ...state,
      isTerminationRequested: true,
      upload: {
        ...state.upload,
        queue: [...state.upload.queue, queuedUploadItem()],
      },
    };

    state = lessonReducer(state, ["close"]);

    expect(state).toEqual(lessonReducerDefault);
    expect(state.phase).toBe("closed");
    expect(state.request).toBeNull();
    expect(state.setup).toBeNull();
    expect(state.session).toBeNull();
    expect(state.isTerminationRequested).toBe(false);
    expect(state.upload).toEqual({ queue: [], log: {} });
  });

  it("settles uploaded results as success or failure while the lesson is open", () => {
    let state = startLesson({ lessonData: createLessonData() });
    state = {
      ...state,
      upload: {
        queue: [queuedUploadItem(), { ...queuedUploadItem(), index: 1 }],
        log: {},
      },
    };

    state = lessonReducer(state, ["resultUploaded", { index: 0, status: "success" }]);
    expect(state.upload.queue).toHaveLength(1);
    expect(state.upload.queue[0]?.index).toBe(1);
    expect(state.upload.log).toEqual({ 0: "success" });

    state = lessonReducer(state, ["resultUploaded", { index: 1, status: "error" }]);
    expect(state.upload.queue).toEqual([]);
    expect(state.upload.log).toEqual({ 0: "success", 1: "error" });

    const closed = lessonReducer(structuredClone(lessonReducerDefault), [
      "resultUploaded",
      { index: 0, status: "success" },
    ]);
    expect(closed).toEqual(lessonReducerDefault);
  });

  it("ignores open while a lesson is already active", () => {
    const openState = lessonReducer(structuredClone(lessonReducerDefault), ["open", { type: "total" }]);
    const repeated = lessonReducer(openState, ["open", { type: "review", deckId: 3 }]);

    expect(repeated).toBe(openState);
    expect(repeated.request).toEqual({ type: "total" });
  });
});

describe("calculateInitialLessonAmounts", () => {
  it("calculates total lesson amounts from per-type and total limits", () => {
    expect(
      calculateInitialLessonAmounts({
        type: "total",
        available: TOTAL_LESSONS.total,
        dailyLimits: TOTAL_TODAY_REVIEW_TOTALS.dailyLimits,
        reviewTotals: TOTAL_TODAY_REVIEW_TOTALS.reviewTotals,
      }),
    ).toEqual(TOTAL_EXPECTED_AMOUNTS);
  });

  it("clamps a single lesson type by the remaining total allowance", () => {
    expect(
      calculateInitialLessonAmounts({
        type: "review",
        available: REVIEW_LESSONS.total,
        dailyLimits: REVIEW_TODAY_REVIEW_TOTALS.dailyLimits,
        reviewTotals: REVIEW_TODAY_REVIEW_TOTALS.reviewTotals,
      }),
    ).toEqual(REVIEW_EXPECTED_AMOUNTS);
  });
});
