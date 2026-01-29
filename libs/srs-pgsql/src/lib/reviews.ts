import {
  calculateTodaysReviewTotals,
  getCurrentLearningDayRange,
  handleDBError,
  learningSettingsValidation,
} from "@koloda/srs";
import type { GetReviewsData, GetReviewTotalsProps, InsertReviewData, Review, ReviewTotals } from "@koloda/srs";
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
  const result = await db
    .select()
    .from(reviews)
    .where(eq(reviews.cardId, Number(cardId)));

  return result as Review[];
}

/**
 * Adds a new review to the database
 * @param db - The database instance
 * @param data - The review data to insert
 * @returns The created review object
 */
export async function addReview(db: DB, data: InsertReviewData) {
  try {
    const result = await db.insert(reviews).values(data).returning();
    return result[0] as Review;
  } catch (e) {
    handleDBError(e);
    return;
  }
}

/**
 * Gets the totals of different types of reviews within a date range
 * @param db - The database instance
 * @param from - Start datetime for the query
 * @param to - End datetime for the query
 * @returns Review totals object containing counts for every lesson type + total
 */
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

/**
 * Gets the review totals for the current learning day
 * @param db - The database instance
 * @returns Object containing daily limits, review totals, and metadata about limits
 * @throws {Error} If can't get learning settings or review totals
 */
export async function getTodaysReviewTotals(db: DB) {
  const learningSettings = await getSettings(db, "learning");
  const content = learningSettingsValidation.parse(learningSettings?.content);
  if (!learningSettingsValidation.parse(content)) throw new Error("Can't parse learning settings");
  const { from, to } = await getCurrentLearningDayRange(content.dayStartsAt as string);
  const reviewTotals = await getReviewTotals(db, { from, to });
  if (!reviewTotals) throw new Error("Error while querying for review totals");
  return calculateTodaysReviewTotals(content, reviewTotals);
}
