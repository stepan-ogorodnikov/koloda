import { eq, sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { DateInput, ReviewLog as ReviewFSRS } from "ts-fsrs";
import { z } from "zod/v4";
import type { Card } from "./cards";
import { handleDBError, TIMESTAMPS } from "./db";
import type { DB } from "./db";
import type { LessonType } from "./lessons";
import { reviews } from "./schema";
import { getSettings } from "./settings";
import { learningSettingsValidation } from "./settings-learning";
import { mapObjectPropertiesReverse } from "./utility";
import type { ObjectPropertiesMapping } from "./utility";

export type { ReviewLog as ReviewFSRS } from "ts-fsrs";

const reviewValidation = {
  rating: z.int().min(0).max(4),
  state: z.int().min(0).max(3),
};

export const selectReviewSchema = createSelectSchema(reviews, reviewValidation);
export type Review = z.input<typeof selectReviewSchema>;

export type GetReviewsParams = { cardId: Card["id"] | string };

export async function getReviews(db: DB, { cardId }: GetReviewsParams) {
  const result = await db.select().from(reviews).where(eq(reviews.cardId, Number(cardId)));
  return result;
}

export const insertReviewSchema = createInsertSchema(reviews, reviewValidation).omit(TIMESTAMPS);
export type InsertReviewData = z.infer<typeof insertReviewSchema>;

export async function addReview(db: DB, data: InsertReviewData) {
  try {
    const result = await db.insert(reviews).values(data).returning();
    return result[0] as Review;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

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

type GetReviewTotalsProps = {
  from: DateInput;
  to: DateInput;
};

type ReviewTotals = Record<LessonType, number>;

export async function getReviewTotals(db: DB, { from, to }: GetReviewTotalsProps) {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE state = 0) AS untouched,
        COUNT(*) FILTER (WHERE state IN (1,3) AND due_at < ${to}) AS learn,
        COUNT(*) FILTER (WHERE state = 2 AND due_at < ${to}) AS review,
        COUNT(*) FILTER (WHERE state IN (0,1,2,3) AND due_at < ${to}) AS total
      FROM reviews
      WHERE is_ignored = false
        AND created_at >= ${from}
        AND created_at <  ${to}
    `);
    return result.rows[0] as ReviewTotals;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

export async function getTodaysReviewTotals(db: DB) {
  const learningSettings = await getSettings(db, "learning");
  const content = learningSettingsValidation.parse(learningSettings?.content);
  if (!learningSettingsValidation.parse(content)) throw ("Can't parse learning settings");
  // convert 0 to Infinity
  const dailyLimits = Object.fromEntries(
    Object.entries(content.dailyLimits).map(([key, value]) => [key, value || Infinity]),
  );
  const { from, to } = await getCurrentLearningDayRange(content.dayStartsAt as string);
  const reviewTotals = await getReviewTotals(db, { from, to });
  if (!reviewTotals) throw ("Error while querying for review totals");
  const { untouched, learn, review, total } = reviewTotals;
  const meta = {
    isUntouchedOverTheLimit: (untouched > 0) && (untouched > dailyLimits.untouched || total > dailyLimits.total),
    isLearnOverTheLimit: (learn > 0) && (learn > dailyLimits.learn || total > dailyLimits.total),
    isReviewOverTheLimit: (review > 0) && (review > dailyLimits.review || total > dailyLimits.total),
    isTotalOverTheLimit: (total > 0) && (total >= dailyLimits.total),
  };
  return { dailyLimits, reviewTotals, meta };
}

export type TodaysReviewTotals = Awaited<ReturnType<typeof getTodaysReviewTotals>>;

const FSRS_REVIEW_PROPERTIES: ObjectPropertiesMapping<Review, ReviewFSRS> = {
  dueAt: "due",
  learningSteps: "learning_steps",
  scheduledDays: "scheduled_days",
} as const;

export function createReviewFromReviewFSRS(input: ReviewFSRS) {
  return mapObjectPropertiesReverse(input, FSRS_REVIEW_PROPERTIES) as Omit<InsertReviewData, "cardId" | "isIgnored">;
}
