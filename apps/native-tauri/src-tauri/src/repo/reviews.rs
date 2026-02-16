use rusqlite::{params, Row};

use crate::app::db::Database;
use crate::app::error::{error_codes, AppError};
use crate::app::utility::get_current_timestamp;
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
}

pub fn get_review_totals(db: &Database, params: GetReviewTotalsParams) -> Result<ReviewTotals, AppError> {
    db.with_conn(|conn| {
        let result = conn.query_row(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE state = 0) AS untouched,
                COUNT(*) FILTER (WHERE state IN (1, 3) AND created_at < ?2) AS learn,
                COUNT(*) FILTER (WHERE state = 2 AND created_at < ?2) AS review,
                COUNT(*) FILTER (WHERE state IN (0, 1, 2, 3) AND created_at < ?2) AS total
            FROM reviews
            WHERE is_ignored = 0
              AND created_at >= ?1
              AND created_at < ?2
            "#,
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
}

fn parse_day_starts_at(day_starts_at: &str) -> (u32, u32) {
    let parts: Vec<&str> = day_starts_at.split(':').collect();
    if parts.len() != 2 {
        return (0, 0);
    }

    let hours: u32 = parts[0].parse().unwrap_or(0);
    let minutes: u32 = parts[1].parse().unwrap_or(0);

    (hours, minutes)
}

const MILLIS_PER_SECOND: i64 = 1000;
const SECONDS_PER_MINUTE: i64 = 60;
const SECONDS_PER_HOUR: i64 = 3600;
const SECONDS_PER_DAY: i64 = 86400;

fn get_current_learning_day_range(day_starts_at: &str) -> Result<(i64, i64), AppError> {
    let (hours, minutes) = parse_day_starts_at(day_starts_at);
    let now = get_current_timestamp()?;

    let now_seconds = now / MILLIS_PER_SECOND;
    let seconds_since_midnight = now_seconds % SECONDS_PER_DAY;
    let boundary_seconds_from_midnight = i64::from(hours) * SECONDS_PER_HOUR + i64::from(minutes) * SECONDS_PER_MINUTE;
    let today_boundary_seconds = now_seconds - seconds_since_midnight + boundary_seconds_from_midnight;
    let (from_seconds, to_seconds) = if seconds_since_midnight < boundary_seconds_from_midnight {
        (today_boundary_seconds - SECONDS_PER_DAY, today_boundary_seconds)
    } else {
        (today_boundary_seconds, today_boundary_seconds + SECONDS_PER_DAY)
    };
    let from = from_seconds * MILLIS_PER_SECOND;
    let to = to_seconds * MILLIS_PER_SECOND;

    Ok((from, to))
}

pub fn get_todays_review_totals(db: &Database) -> Result<TodaysReviewTotals, AppError> {
    let learning_settings: LearningSettings = settings_repo::get_settings(db, SettingsName::Learning)?
        .ok_or_else(|| AppError::new(error_codes::DB_GET, None))
        .and_then(|s| {
            serde_json::from_value(s.content).map_err(|e| AppError::new(error_codes::UNKNOWN, Some(e.to_string())))
        })?;

    let (from, to) = get_current_learning_day_range(&learning_settings.day_starts_at)?;
    let review_totals = get_review_totals(db, GetReviewTotalsParams { from, to })?;

    let daily_limits = DailyLimits {
        total: learning_settings.daily_limits.total,
        untouched: learning_settings.daily_limits.untouched,
        learn: learning_settings.daily_limits.learn,
        review: learning_settings.daily_limits.review,
    };

    let meta = TodaysReviewTotalsMeta {
        is_untouched_over_the_limit: review_totals.untouched > 0
            && (review_totals.untouched > i64::from(daily_limits.untouched)
                || review_totals.total >= i64::from(daily_limits.total)),
        is_learn_over_the_limit: review_totals.learn > 0
            && (review_totals.learn > i64::from(daily_limits.learn)
                || review_totals.total >= i64::from(daily_limits.total)),
        is_review_over_the_limit: review_totals.review > 0
            && (review_totals.review > i64::from(daily_limits.review)
                || review_totals.total >= i64::from(daily_limits.total)),
        is_total_over_the_limit: review_totals.total > 0 && review_totals.total >= i64::from(daily_limits.total),
    };

    Ok(TodaysReviewTotals {
        daily_limits,
        review_totals,
        meta,
    })
}
