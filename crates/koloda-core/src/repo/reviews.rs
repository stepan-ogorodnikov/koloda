use rusqlite::{params, Row};

use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::domain::cards::CardState;
use crate::domain::learning_day::current_learning_day_range;
use crate::domain::reviews::{
    DailyLimits, GetReviewTotalsParams, GetReviewsData, Review, ReviewTotals, TodaysReviewTotals,
    TodaysReviewTotalsMeta,
};
use crate::domain::settings::SettingsName;
use crate::domain::settings_learning::LearningSettings;
use crate::repo::settings as settings_repo;

fn get_review_row(row: &Row) -> Result<Review, rusqlite::Error> {
    Ok(Review {
        id: row.get(0)?,
        card_id: row.get(1)?,
        rating: row.get(2)?,
        state: row.get(3)?,
        due_at: row.get(4)?,
        stability: row.get(5)?,
        difficulty: row.get(6)?,
        scheduled_days: row.get(7)?,
        learning_steps: row.get(8)?,
        time: row.get(9)?,
        is_ignored: row.get(10)?,
        created_at: row.get(11)?,
    })
}

pub fn get_reviews(db: &Database, data: GetReviewsData) -> Result<Vec<Review>, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, card_id, rating, state, due_at, stability, difficulty,
                       scheduled_days, learning_steps, time, is_ignored, created_at
                FROM reviews
                WHERE card_id = ?1
                "#,
            )?;

            let reviews = stmt
                .query_map(params![data.card_id], get_review_row)?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(reviews)
        })
    })
}

pub fn get_review_totals(db: &Database, params: GetReviewTotalsParams) -> Result<ReviewTotals, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        db.with_conn(|conn| {
            // WHY: The outer WHERE already restricts rows to the learning-day window `[from, to)`.
            // `untouched` only needs `state = New` inside its FILTER because that window applies
            // to every bucket. The extra `created_at < ?2` on learn/review/total is redundant
            // with the outer bound but documents per-bucket intent.
            let result = conn.query_row(
                &format!(
                    r#"
                SELECT
                    COUNT(*) FILTER (WHERE state = {new}) AS untouched,
                    COUNT(*) FILTER (WHERE state IN ({learning}, {relearning}) AND created_at < ?2) AS learn,
                    COUNT(*) FILTER (WHERE state = {review} AND created_at < ?2) AS review,
                    COUNT(*) FILTER (WHERE state IN ({new}, {learning}, {review}, {relearning}) AND created_at < ?2) AS total
                FROM reviews
                WHERE is_ignored = 0
                  AND created_at >= ?1
                  AND created_at < ?2
                "#,
                    new = CardState::New.as_i32(),
                    learning = CardState::Learning.as_i32(),
                    relearning = CardState::Relearning.as_i32(),
                    review = CardState::Review.as_i32(),
                ),
                params![params.from, params.to],
                |row| {
                    Ok(ReviewTotals {
                        untouched: row.get(0)?,
                        learn: row.get(1)?,
                        review: row.get(2)?,
                        total: row.get(3)?,
                    })
                },
            )?;

            Ok(result)
        })
    })
}

pub fn get_todays_review_totals(db: &Database) -> Result<TodaysReviewTotals, AppError> {
    throw_known_error(error_codes::DB_GET, || {
        let learning_settings: LearningSettings = settings_repo::get_settings(db, SettingsName::Learning)?
            .ok_or_else(|| AppError::new(error_codes::DB_GET, None))
            .and_then(|s| {
                serde_json::from_value(s.content).map_err(|e| AppError::new(error_codes::UNKNOWN, Some(e.to_string())))
            })?;

        let (from, to) = current_learning_day_range(&learning_settings.day_starts_at)?;
        let review_totals = get_review_totals(db, GetReviewTotalsParams { from, to })?;

        let daily_limits = DailyLimits {
            total: learning_settings.daily_limits.total,
            untouched: learning_settings.daily_limits.untouched.clone(),
            learn: learning_settings.daily_limits.learn.clone(),
            review: learning_settings.daily_limits.review.clone(),
        };
        let counted_total = [
            (daily_limits.untouched.counts, review_totals.untouched),
            (daily_limits.learn.counts, review_totals.learn),
            (daily_limits.review.counts, review_totals.review),
        ]
        .into_iter()
        .fold(
            0_i64,
            |total, (counts, value)| {
                if counts {
                    total + value
                } else {
                    total
                }
            },
        );
        let review_totals = ReviewTotals {
            total: counted_total,
            ..review_totals
        };

        let meta = TodaysReviewTotalsMeta {
            is_untouched_over_the_limit: review_totals.untouched > 0
                && (review_totals.untouched > i64::from(daily_limits.untouched.value)
                    || (daily_limits.total > 0
                        && daily_limits.untouched.counts
                        && review_totals.total >= i64::from(daily_limits.total))),
            is_learn_over_the_limit: review_totals.learn > 0
                && (review_totals.learn > i64::from(daily_limits.learn.value)
                    || (daily_limits.total > 0
                        && daily_limits.learn.counts
                        && review_totals.total >= i64::from(daily_limits.total))),
            is_review_over_the_limit: review_totals.review > 0
                && (review_totals.review > i64::from(daily_limits.review.value)
                    || (daily_limits.total > 0
                        && daily_limits.review.counts
                        && review_totals.total >= i64::from(daily_limits.total))),
            is_total_over_the_limit: daily_limits.total > 0
                && review_totals.total > 0
                && review_totals.total >= i64::from(daily_limits.total),
        };

        Ok(TodaysReviewTotals {
            daily_limits,
            review_totals,
            meta,
        })
    })
}
