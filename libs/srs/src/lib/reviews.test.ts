import { describe, expect, it, vi } from "vitest";
import type { AppError } from "./error";
import { calculateTodaysReviewTotals, createReviewFromReviewFSRS, getCurrentLearningDayRange } from "./reviews";
import { DEFAULT_LEARNING_SETTINGS } from "./settings-learning";

describe("reviews", () => {
  it("returns the previous learning day range when current time is before the boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 2, 4, 30, 0, 0));

    await expect(getCurrentLearningDayRange("05:00")).resolves.toEqual({
      from: new Date(2024, 0, 1, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 0, 2, 5, 0, 0, 0).toISOString(),
    });
  });

  it("returns the current learning day range when current time is after the boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 2, 6, 30, 0, 0));

    await expect(getCurrentLearningDayRange("05:00")).resolves.toEqual({
      from: new Date(2024, 0, 2, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 0, 3, 5, 0, 0, 0).toISOString(),
    });
  });

  it("rejects invalid learning day boundaries", async () => {
    await expect(getCurrentLearningDayRange("25:00")).rejects.toMatchObject(
      {
        code: "validation.settings-learning.day-starts-at",
      } satisfies Partial<AppError>,
    );
  });

  it("normalizes totals using counts flags and marks over-limit states", async () => {
    const result = await calculateTodaysReviewTotals(
      {
        ...DEFAULT_LEARNING_SETTINGS,
        dailyLimits: {
          total: 4,
          untouched: { value: 2, counts: true },
          learn: { value: 2, counts: false },
          review: { value: 3, counts: true },
        },
      },
      { untouched: 3, learn: 5, review: 2, total: 0 },
    );

    expect(result.reviewTotals).toEqual({
      untouched: 3,
      learn: 5,
      review: 2,
      total: 5,
    });
    expect(result.meta).toEqual({
      isUntouchedOverTheLimit: true,
      isLearnOverTheLimit: true,
      isReviewOverTheLimit: true,
      isTotalOverTheLimit: true,
    });
  });

  it("maps fsrs review properties back to app review fields", () => {
    const result = createReviewFromReviewFSRS({
      rating: 3,
      state: 1,
      due: new Date("2024-01-03T00:00:00.000Z"),
      stability: 2.5,
      difficulty: 4.2,
      scheduled_days: 7,
      learning_steps: 2,
      elapsed_days: 0,
      last_elapsed_days: 0,
      reviewed_date: new Date("2024-01-01T00:00:00.000Z"),
    } as any);

    expect(result).toMatchObject({
      rating: 3,
      state: 1,
      dueAt: new Date("2024-01-03T00:00:00.000Z"),
      stability: 2.5,
      difficulty: 4.2,
      scheduledDays: 7,
      learningSteps: 2,
    });
  });
});
