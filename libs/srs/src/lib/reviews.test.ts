import type { AppError } from "@koloda/app";
import { DEFAULT_LEARNING_SETTINGS } from "@koloda/app";
import { describe, expect, it, vi } from "vitest";
import {
  calculateTodaysReviewTotals,
  createReviewFromReviewFSRS,
  getCurrentLearningDayRange,
  getLearningDayRangeAt,
} from "./reviews";

describe("reviews", () => {
  it("returns the previous learning day range when current time is before the boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 2, 4, 30, 0, 0));

    await expect(getCurrentLearningDayRange("05:00")).resolves.toEqual({
      from: new Date(2024, 0, 1, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 0, 2, 5, 0, 0, 0).toISOString(),
    });
  });

  it("returns the current learning day range when current time is after the boundary", () => {
    expect(getLearningDayRangeAt(new Date(2024, 0, 2, 6, 30, 0, 0), "05:00")).toEqual({
      from: new Date(2024, 0, 2, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 0, 3, 5, 0, 0, 0).toISOString(),
    });
  });

  it("rejects invalid learning day boundaries", async () => {
    await expect(getCurrentLearningDayRange("25:00")).rejects.toMatchObject({
      code: "validation.settings-learning.day-starts-at",
    } satisfies Partial<AppError>);
  });

  it("rejects unpadded learning day boundaries", async () => {
    await expect(getCurrentLearningDayRange("5:00")).rejects.toMatchObject({
      code: "validation.settings-learning.day-starts-at",
    } satisfies Partial<AppError>);
  });

  it("treats the boundary instant as the start of the current learning day", () => {
    expect(getLearningDayRangeAt(new Date(2024, 0, 2, 5, 0, 0, 0), "05:00")).toEqual({
      from: new Date(2024, 0, 2, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 0, 3, 5, 0, 0, 0).toISOString(),
    });
  });

  it("uses midnight as a calendar-date boundary", () => {
    expect(getLearningDayRangeAt(new Date(2024, 5, 15, 12, 0, 0, 0), "00:00")).toEqual({
      from: new Date(2024, 5, 15, 0, 0, 0, 0).toISOString(),
      to: new Date(2024, 5, 16, 0, 0, 0, 0).toISOString(),
    });
  });

  it("uses the last minute of the calendar day as a boundary", () => {
    expect(getLearningDayRangeAt(new Date(2024, 0, 2, 23, 59, 0, 0), "23:59")).toEqual({
      from: new Date(2024, 0, 2, 23, 59, 0, 0).toISOString(),
      to: new Date(2024, 0, 3, 23, 59, 0, 0).toISOString(),
    });
  });

  it("rolls the previous learning day back across a month boundary", () => {
    expect(getLearningDayRangeAt(new Date(2024, 1, 1, 4, 30, 0, 0), "05:00")).toEqual({
      from: new Date(2024, 0, 31, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 1, 1, 5, 0, 0, 0).toISOString(),
    });
  });

  it("rolls the previous learning day back across a year boundary", () => {
    expect(getLearningDayRangeAt(new Date(2024, 0, 1, 4, 30, 0, 0), "05:00")).toEqual({
      from: new Date(2023, 11, 31, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 0, 1, 5, 0, 0, 0).toISOString(),
    });
  });

  it("keeps leap day as a real calendar date", () => {
    expect(getLearningDayRangeAt(new Date(2024, 1, 29, 6, 30, 0, 0), "05:00")).toEqual({
      from: new Date(2024, 1, 29, 5, 0, 0, 0).toISOString(),
      to: new Date(2024, 2, 1, 5, 0, 0, 0).toISOString(),
    });
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

  it("treats a zero total daily limit as no cap", async () => {
    // A daily limit of zero means "no cap", not "hard zero" — mirrors the
    // Rust zero_total_limit_is_no_cap rule.
    const result = await calculateTodaysReviewTotals(
      {
        ...DEFAULT_LEARNING_SETTINGS,
        dailyLimits: {
          total: 0,
          untouched: { value: 10, counts: true },
          learn: { value: 10, counts: true },
          review: { value: 10, counts: true },
        },
      },
      { untouched: 5, learn: 5, review: 5, total: 0 },
    );

    expect(result.meta).toEqual({
      isUntouchedOverTheLimit: false,
      isLearnOverTheLimit: false,
      isReviewOverTheLimit: false,
      isTotalOverTheLimit: false,
    });
  });

  it("does not flag a bucket exactly at its own limit", async () => {
    // A bucket's own limit uses strictly-greater semantics.
    const result = await calculateTodaysReviewTotals(
      {
        ...DEFAULT_LEARNING_SETTINGS,
        dailyLimits: {
          total: 100,
          untouched: { value: 2, counts: true },
          learn: { value: 50, counts: true },
          review: { value: 50, counts: true },
        },
      },
      { untouched: 2, learn: 0, review: 0, total: 0 },
    );

    expect(result.meta).toEqual({
      isUntouchedOverTheLimit: false,
      isLearnOverTheLimit: false,
      isReviewOverTheLimit: false,
      isTotalOverTheLimit: false,
    });
  });

  it("flags counted buckets when the shared total reaches its limit", async () => {
    // The shared total limit uses >= semantics: exactly at the limit is over.
    // Every bucket is under its own limit of 2; only the shared total trips.
    // (Bucket limits must be <= total here — settings validation rejects otherwise.)
    const result = await calculateTodaysReviewTotals(
      {
        ...DEFAULT_LEARNING_SETTINGS,
        dailyLimits: {
          total: 3,
          untouched: { value: 2, counts: true },
          learn: { value: 2, counts: true },
          review: { value: 2, counts: true },
        },
      },
      { untouched: 1, learn: 1, review: 1, total: 0 },
    );

    expect(result.meta).toEqual({
      isUntouchedOverTheLimit: true,
      isLearnOverTheLimit: true,
      isReviewOverTheLimit: true,
      isTotalOverTheLimit: true,
    });
  });

  it("never flags zero activity as over the limit", async () => {
    const result = await calculateTodaysReviewTotals(
      {
        ...DEFAULT_LEARNING_SETTINGS,
        dailyLimits: {
          total: 1,
          untouched: { value: 0, counts: true },
          learn: { value: 0, counts: true },
          review: { value: 0, counts: true },
        },
      },
      { untouched: 0, learn: 0, review: 0, total: 0 },
    );

    expect(result.reviewTotals.total).toBe(0);
    expect(result.meta).toEqual({
      isUntouchedOverTheLimit: false,
      isLearnOverTheLimit: false,
      isReviewOverTheLimit: false,
      isTotalOverTheLimit: false,
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
