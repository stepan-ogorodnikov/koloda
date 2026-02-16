use serde::{Deserialize, Serialize};

use crate::app::utility::{deserialize_optional_timestamp, serialize_optional_timestamp, serialize_timestamp};

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
pub struct DailyLimits {
    pub untouched: u32,
    pub learn: u32,
    pub review: u32,
    pub total: u32,
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
