import { parseDayStartsAt } from "@koloda/app";
import { LEARNING_DAILY_LIMIT_TYPES, learningSettingsValidation } from "@koloda/app";
import type { AllowedSettings } from "@koloda/settings";
import type { DateInput, ReviewLog as ReviewFSRS } from "ts-fsrs";
import { z } from "zod";
import { cardValidation } from "./cards";
import type { Card } from "./cards";
import type { LessonType } from "./lessons";
import type { ProgressFieldValues } from "./progress";
import {
  REVIEWS_PROGRESS_FIELD_CODES,
  validateProgressFields,
  validateReviewRating,
  validateReviewTime,
} from "./progress";

type ReviewRefinementValues = ProgressFieldValues & {
  rating: number;
  time: number;
};

export type { ReviewLog as ReviewFSRS } from "ts-fsrs";

const reviewFieldsSchema = z.object({
  id: z.uuid(),
  cardId: cardValidation.shape.id,
  rating: z.int(),
  state: z.int(),
  // INVARIANT: desktop `Review`/`InsertReviewData` is `i64`; never make this nullable.
  // Card `dueAt` is the nullable field.
  dueAt: z.date(),
  stability: z.number().default(0),
  difficulty: z.number().default(0),
  scheduledDays: z.int().default(0),
  learningSteps: z.int().default(0),
  time: z.int().default(0),
  isIgnored: z.boolean().default(false),
  createdAt: z.date(),
});

function refineReview(data: ReviewRefinementValues, ctx: z.RefinementCtx) {
  validateReviewRating(data.rating, ctx);
  validateProgressFields(data, REVIEWS_PROGRESS_FIELD_CODES, ctx);
  validateReviewTime(data.time, ctx);
}

export const reviewValidation = reviewFieldsSchema.superRefine(refineReview);

export const reviewRowSchema = reviewValidation;

export type Review = z.input<typeof reviewValidation>;

export type GetReviewsData = { cardId: Card["id"] };

// INVARIANT: mirrors Rust `InsertReviewData` (crates/koloda/src/domain/reviews.rs) — no
// `createdAt` field; the repo stamps it at insert time (`submitLessonResult` / `insert_review`).
export const insertReviewSchema = reviewFieldsSchema.omit({ id: true, createdAt: true }).superRefine(refineReview);

export type InsertReviewData = z.infer<typeof insertReviewSchema>;

export function getLearningDayRangeAt(now: Date, dayStartsAt: string) {
  const { hours, minutes } = parseDayStartsAt(dayStartsAt);

  const todayBoundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

  let from: Date;
  let to: Date;

  if (now < todayBoundary) {
    from = new Date(todayBoundary);
    from.setDate(from.getDate() - 1);
    to = todayBoundary;
  } else {
    from = todayBoundary;
    to = new Date(todayBoundary);
    to.setDate(to.getDate() + 1);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export async function getCurrentLearningDayRange(dayStartsAt: string) {
  return getLearningDayRangeAt(new Date(), dayStartsAt);
}

export type GetReviewTotalsProps = {
  from: DateInput;
  to: DateInput;
};

export type ReviewTotals = Record<LessonType, number>;

export const reviewTotalsSchema = z.object({
  untouched: z.coerce.number(),
  learn: z.coerce.number(),
  review: z.coerce.number(),
  total: z.coerce.number(),
}) satisfies z.ZodType<ReviewTotals>;

export async function calculateTodaysReviewTotals(
  learningSettings: AllowedSettings<"learning">["content"],
  reviewTotals: ReviewTotals,
) {
  const { dailyLimits } = learningSettingsValidation.parse(learningSettings);
  const countedTotal = LEARNING_DAILY_LIMIT_TYPES.reduce(
    (total, type) => (dailyLimits[type].counts ? total + Number(reviewTotals[type] || 0) : total),
    0,
  );
  const normalizedReviewTotals = { ...reviewTotals, total: countedTotal };
  const { untouched, learn, review, total } = normalizedReviewTotals;
  const meta = {
    isUntouchedOverTheLimit:
      untouched > 0 &&
      (untouched > dailyLimits.untouched.value ||
        (dailyLimits.total > 0 && dailyLimits.untouched.counts && total >= dailyLimits.total)),
    isLearnOverTheLimit:
      learn > 0 &&
      (learn > dailyLimits.learn.value ||
        (dailyLimits.total > 0 && dailyLimits.learn.counts && total >= dailyLimits.total)),
    isReviewOverTheLimit:
      review > 0 &&
      (review > dailyLimits.review.value ||
        (dailyLimits.total > 0 && dailyLimits.review.counts && total >= dailyLimits.total)),
    isTotalOverTheLimit: dailyLimits.total > 0 && total > 0 && total >= dailyLimits.total,
  };
  return { dailyLimits, reviewTotals: normalizedReviewTotals, meta };
}

export type TodaysReviewTotals = Awaited<ReturnType<typeof calculateTodaysReviewTotals>>;

// Twin of `createUpdateCardProgress`: the submit payload must carry exactly the fields
// Rust `InsertReviewData` deserializes — other ts-fsrs `ReviewLog` keys (elapsed_days,
// last_elapsed_days, review) must not leak into it.
export function createReviewFromReviewFSRS(input: ReviewFSRS): Omit<InsertReviewData, "cardId" | "time" | "isIgnored"> {
  const { rating, state, due, stability, difficulty, scheduled_days, learning_steps } = input;
  return {
    rating,
    state,
    dueAt: due,
    stability,
    difficulty,
    scheduledDays: scheduled_days,
    learningSteps: learning_steps,
  };
}
