import {
  calculateTodaysReviewTotals,
  getCurrentLearningDayRange,
  learningSettingsValidation,
  throwKnownError,
} from "@koloda/srs";
import type { GetReviewsData, GetReviewTotalsProps, Review, ReviewTotals } from "@koloda/srs";
import { eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { reviews } from "./schema";
import { getSettings } from "./settings";

/**
 * Retrieves all reviews for a specific card
 * @param db - The database instance
 * @param cardId - The ID of the card to retrieve reviews for
 * @returns Array of review objects
 */
export async function getReviews(db: DB, { cardId }: GetReviewsData) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(reviews)
      .where(eq(reviews.cardId, Number(cardId)));
    return result as Review[];
  });
}

/**
 * Gets the totals of different types of reviews within a date range
 * @param db - The database instance
 * @param from - Start datetime for the query
 * @param to - End datetime for the query
 * @returns Review totals object containing counts for every lesson type + total
 */
export async function getReviewTotals(db: DB, { from, to }: GetReviewTotalsProps) {
  return throwKnownError("db.get", async () => {
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
  });
}

/**
 * Gets the review totals for the current learning day
 * @param db - The database instance
 * @returns Object containing daily limits, review totals, and metadata about limits
 * @throws {ZodError} If can't get learning settings or review totals
 */
export async function getTodaysReviewTotals(db: DB) {
  return throwKnownError("db.get", async () => {
    const learningSettings = await getSettings(db, "learning");
    const content = learningSettingsValidation.parse(learningSettings?.content);
    const { from, to } = await getCurrentLearningDayRange(content.dayStartsAt as string);
    const reviewTotals = await getReviewTotals(db, { from, to });

    return calculateTodaysReviewTotals(content, reviewTotals);
  });
}
