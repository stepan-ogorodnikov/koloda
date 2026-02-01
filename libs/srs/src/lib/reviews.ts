import type { DateInput, ReviewLog as ReviewFSRS } from "ts-fsrs";
import { z } from "zod/v4";
import { type Card, cardValidation } from "./cards";
import type { LessonType } from "./lessons";
import type { AllowedSettings } from "./settings";
import { mapObjectPropertiesReverse } from "./utility";
import type { ObjectPropertiesMapping } from "./utility";

export type { ReviewLog as ReviewFSRS } from "ts-fsrs";

export const reviewValidation = z.object({
  id: z.bigint(),
  cardId: cardValidation.shape.id,
  rating: z.int().min(0).max(4),
  state: z.int().min(0).max(3),
  dueAt: z.date(),
  stability: z.number().default(0),
  difficulty: z.number().default(0),
  scheduledDays: z.int().default(0),
  learningSteps: z.int().default(0),
  isIgnored: z.boolean().default(false),
  createdAt: z.date(),
});

export type Review = z.input<typeof reviewValidation>;

export type GetReviewsData = { cardId: Card["id"] | string };

export const insertReviewSchema = reviewValidation.omit({ id: true });

export type InsertReviewData = z.infer<typeof insertReviewSchema>;

/**
 * Calculates the datetime range for the current learning day based on the dayStartsAt from learning settings
 * @param dayStartsAt - Time in 'hh:mm' format when the learning day starts
 * @returns Object containing 'from' and 'to' timestamps in ISO string format
 * @throws {Error} If dayStartsAt is not in 'hh:mm' format or out of range
 */
export async function getCurrentLearningDayRange(dayStartsAt: string) {
  const match = dayStartsAt.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error("dayStartsAt must be 'hh:mm'");

  const [_, hhStr, mmStr] = match;
  const hours = parseInt(hhStr);
  const minutes = parseInt(mmStr);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid time in dayStartsAt");
  }

  const now = new Date();

  const todayBoundary = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
    0,
    0,
  );

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

export type GetReviewTotalsProps = {
  from: DateInput;
  to: DateInput;
};

export type ReviewTotals = Record<LessonType, number>;

/**
 * Gets the review totals for the current learning day
 * @param learningSettings - User's learning settings
 * @param reviewTotals - Review totals for current learning day
 * @returns Object containing daily limits, review totals, and metadata about limits
 */
export async function calculateTodaysReviewTotals(
  learningSettings: AllowedSettings<"learning">["content"],
  reviewTotals: ReviewTotals,
) {
  const dailyLimits = Object.fromEntries(
    Object.entries(learningSettings.dailyLimits).map(([key, value]) => [key, value || 0]),
  );
  const { untouched, learn, review, total } = reviewTotals;
  const meta = {
    isUntouchedOverTheLimit: (untouched > 0) && (untouched > dailyLimits.untouched || total > dailyLimits.total),
    isLearnOverTheLimit: (learn > 0) && (learn > dailyLimits.learn || total > dailyLimits.total),
    isReviewOverTheLimit: (review > 0) && (review > dailyLimits.review || total > dailyLimits.total),
    isTotalOverTheLimit: (total > 0) && (total >= dailyLimits.total),
  };
  return { dailyLimits, reviewTotals, meta };
}

export type TodaysReviewTotals = Awaited<ReturnType<typeof calculateTodaysReviewTotals>>;

const FSRS_REVIEW_PROPERTIES: ObjectPropertiesMapping<Review, ReviewFSRS> = {
  dueAt: "due",
  learningSteps: "learning_steps",
  scheduledDays: "scheduled_days",
} as const;

/**
 * Creates a review object from an FSRS review object
 * @param input - The FSRS review object to convert
 * @returns The converted review object
 */
export function createReviewFromReviewFSRS(input: ReviewFSRS) {
  return mapObjectPropertiesReverse(input, FSRS_REVIEW_PROPERTIES) as Omit<InsertReviewData, "cardId" | "isIgnored">;
}
