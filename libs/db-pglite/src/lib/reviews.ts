import { throwKnownError } from "@koloda/app";
import { learningSettingsValidation } from "@koloda/app";
import {
  calculateTodaysReviewTotals,
  getCurrentLearningDayRange,
  reviewRowSchema,
  reviewTotalsSchema,
} from "@koloda/srs";
import type { GetReviewsData, GetReviewTotalsProps } from "@koloda/srs";
import { eq, sql } from "drizzle-orm";
import type { DB } from "./db";
import { assertRows, parseRow } from "./parse-rows";
import { reviews } from "./schema";
import { getSettings } from "./settings";

export async function getReviews(db: DB, { cardId }: GetReviewsData) {
  return throwKnownError("db.get", async () => {
    const result = await db
      .select()
      .from(reviews)
      .where(eq(reviews.cardId, Number(cardId)));
    return assertRows(reviewRowSchema, result);
  });
}

export async function getReviewTotals(db: DB, { from, to }: GetReviewTotalsProps) {
  return throwKnownError("db.get", async () => {
    // WHY: Today's totals are a created_at log for the learning-day window, not cards due now.
    // due_at on a review row is the next schedule after that grade; it is often after `to`.
    // Do not add due_at to these FILTERs — that undercounts Learn/Review vs desktop (`get_review_totals`).
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE state = 0) AS untouched,
        COUNT(*) FILTER (WHERE state IN (1,3)) AS learn,
        COUNT(*) FILTER (WHERE state = 2) AS review,
        COUNT(*) FILTER (WHERE state IN (0,1,2,3)) AS total
      FROM reviews
      WHERE is_ignored = false
        AND created_at >= ${from}
        AND created_at <  ${to}
    `);

    return parseRow(reviewTotalsSchema, result.rows[0]);
  });
}

export async function getTodaysReviewTotals(db: DB) {
  return throwKnownError("db.get", async () => {
    const learningSettings = await getSettings(db, "learning");
    const content = learningSettingsValidation.parse(learningSettings?.content);
    const { from, to } = await getCurrentLearningDayRange(content.dayStartsAt);
    const reviewTotals = await getReviewTotals(db, { from, to });

    return calculateTodaysReviewTotals(content, reviewTotals);
  });
}
