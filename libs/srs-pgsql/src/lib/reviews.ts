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
