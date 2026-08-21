//! Review rows and learning-day totals — mirrors `@koloda/srs` `reviewValidation`.

use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};
use crate::domain::progress::{
    validate_difficulty, validate_learning_steps, validate_scheduled_days, validate_stability, validate_state,
};
use crate::domain::settings_learning::DailyLimits;
use crate::domain::time::{deserialize_optional_timestamp, serialize_optional_timestamp, serialize_timestamp};

const RATING_MIN: i32 = 1;
const RATING_MAX: i32 = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub id: i64,
    pub card_id: i64,
    pub rating: i32,
    pub state: i32,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_timestamp",
        serialize_with = "serialize_optional_timestamp"
    )]
    pub due_at: Option<i64>,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i32,
    pub learning_steps: i32,
    pub time: i32,
    pub is_ignored: bool,
    #[serde(serialize_with = "serialize_timestamp")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertReviewData {
    pub card_id: i64,
    pub rating: i32,
    pub state: i32,
    #[serde(default, deserialize_with = "deserialize_optional_timestamp")]
    pub due_at: Option<i64>,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i32,
    pub learning_steps: i32,
    pub time: i32,
    pub is_ignored: bool,
}

impl InsertReviewData {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_rating(self.rating)?;
        validate_state(self.state, error_codes::VALIDATION_REVIEWS_STATE)?;
        validate_stability(self.stability, error_codes::VALIDATION_REVIEWS_STABILITY)?;
        validate_difficulty(self.difficulty, error_codes::VALIDATION_REVIEWS_DIFFICULTY)?;
        validate_scheduled_days(self.scheduled_days, error_codes::VALIDATION_REVIEWS_SCHEDULED_DAYS)?;
        validate_learning_steps(self.learning_steps, error_codes::VALIDATION_REVIEWS_LEARNING_STEPS)?;
        validate_time(self.time)?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetReviewsData {
    pub card_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetReviewTotalsParams {
    pub from: i64,
    pub to: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewTotals {
    pub untouched: i64,
    pub learn: i64,
    pub review: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodaysReviewTotalsMeta {
    pub is_untouched_over_the_limit: bool,
    pub is_learn_over_the_limit: bool,
    pub is_review_over_the_limit: bool,
    pub is_total_over_the_limit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodaysReviewTotals {
    pub daily_limits: DailyLimits,
    pub review_totals: ReviewTotals,
    pub meta: TodaysReviewTotalsMeta,
}

/// Pure daily-limit policy — mirrors `@koloda/srs` `calculateTodaysReviewTotals`.
///
/// Replaces `review_totals.total` with the sum of buckets whose limit type has
/// `counts = true`, then derives the over-limit flags against those normalized
/// totals. Keep in sync with the TS implementation when limits policy changes.
pub fn calculate_todays_review_totals(
    mut review_totals: ReviewTotals,
    daily_limits: DailyLimits,
) -> TodaysReviewTotals {
    // INVARIANT: only buckets whose limit has `counts = true` contribute to
    // `total`, so "today's total" ignores non-counted types.
    review_totals.total = [
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

    let meta = TodaysReviewTotalsMeta {
        is_untouched_over_the_limit: is_bucket_over_the_limit(
            daily_limits.untouched.counts,
            review_totals.untouched,
            daily_limits.untouched.value,
            review_totals.total,
            daily_limits.total,
        ),
        is_learn_over_the_limit: is_bucket_over_the_limit(
            daily_limits.learn.counts,
            review_totals.learn,
            daily_limits.learn.value,
            review_totals.total,
            daily_limits.total,
        ),
        is_review_over_the_limit: is_bucket_over_the_limit(
            daily_limits.review.counts,
            review_totals.review,
            daily_limits.review.value,
            review_totals.total,
            daily_limits.total,
        ),
        is_total_over_the_limit: daily_limits.total > 0
            && review_totals.total > 0
            && review_totals.total >= i64::from(daily_limits.total),
    };

    TodaysReviewTotals {
        daily_limits,
        review_totals,
        meta,
    }
}

// INVARIANT: a limit value of 0 is "no cap", not a hard zero; a bucket is over
// its own limit strictly above it, and over the shared Total only when it counts
// toward Total and the (non-zero) Total is reached (`>=`, matching TS).
fn is_bucket_over_the_limit(counted: bool, bucket: i64, bucket_limit: u32, total: i64, total_limit: u32) -> bool {
    bucket > 0 && (bucket > i64::from(bucket_limit) || (total_limit > 0 && counted && total >= i64::from(total_limit)))
}

fn validate_rating(rating: i32) -> Result<(), AppError> {
    if !(RATING_MIN..=RATING_MAX).contains(&rating) {
        return Err(AppError::new(
            error_codes::VALIDATION_REVIEWS_RATING,
            Some(format!("Invalid review rating: {}", rating)),
        ));
    }
    Ok(())
}

fn validate_time(time: i32) -> Result<(), AppError> {
    if time < 0 {
        return Err(AppError::new(
            error_codes::VALIDATION_REVIEWS_TIME,
            Some(format!("Invalid review time: {}", time)),
        ));
    }
    Ok(())
}
