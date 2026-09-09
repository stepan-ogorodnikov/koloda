import { throwKnownError } from "@koloda/app";
import { learningSettingsValidation } from "@koloda/app";
import {
  calculateTodaysReviewTotals,
  getCurrentLearningDayRange,
  reviewRowSchema,
  reviewTotalsSchema,
} from "@koloda/srs";
import type { GetReviewsData, GetReviewTotalsProps } from "@koloda/srs";
import { REVIEW_SELECT } from "./columns";
import type { DB } from "./db";
import { parseRow, parseRows } from "./parse-rows";
import { getSettings } from "./settings";
import { FSRS_LEARNING, FSRS_NEW, FSRS_RELEARNING, FSRS_REVIEW, toUnixMs } from "./sql";

export async function getReviews(db: DB, { cardId }: GetReviewsData) {
  return throwKnownError("db.get", async () => {
    const result = await db.all(`SELECT ${REVIEW_SELECT} FROM reviews WHERE card_id = ?`, [Number(cardId)]);
    return parseRows(reviewRowSchema, result, { bigintId: true });
  });
}

export async function getReviewTotals(db: DB, { from, to }: GetReviewTotalsProps) {
  return throwKnownError("db.get", async () => {
    // WHY: Today's totals are a created_at log for the learning-day window, not cards due now.
    // due_at on a review row is the next schedule after that grade; it is often after `to`.
    // Do not add due_at to these FILTERs — that undercounts Learn/Review vs desktop (`get_review_totals`).
    const result = await db.get(
      `SELECT
         COUNT(*) FILTER (WHERE state = ${FSRS_NEW}) AS untouched,
         COUNT(*) FILTER (WHERE state IN (${FSRS_LEARNING}, ${FSRS_RELEARNING})) AS learn,
         COUNT(*) FILTER (WHERE state = ${FSRS_REVIEW}) AS review,
         COUNT(*) FILTER (WHERE state IN (${FSRS_NEW}, ${FSRS_LEARNING}, ${FSRS_REVIEW}, ${FSRS_RELEARNING})) AS total
       FROM reviews
       WHERE is_ignored = 0
         AND created_at >= ?
         AND created_at < ?`,
      [toUnixMs(from as Date | string | number), toUnixMs(to as Date | string | number)],
    );

    return parseRow(reviewTotalsSchema, result ?? {});
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
