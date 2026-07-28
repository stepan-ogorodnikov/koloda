use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::app::error::{error_codes, AppError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningSettings {
    pub defaults: Value,
    pub daily_limits: DailyLimits,
    pub day_starts_at: String,
    pub learn_ahead_limit: LearnAheadLimit,
}

impl LearningSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        self.daily_limits.validate()?;
        self.learn_ahead_limit.validate()?;
        parse_day_starts_at(&self.day_starts_at)?;
        Ok(())
    }
}

// INVARIANT: on `Ok`, returns `(hours, minutes)` with `0 <= hours <= 23` and `0 <= minutes <= 59`.
// Callers (`learning_day_range_at`) rely on this to construct a `NaiveTime` without re-validating.
pub fn parse_day_starts_at(value: &str) -> Result<(u32, u32), AppError> {
    let bytes = value.as_bytes();
    if value.len() != 5 || bytes[2] != b':' {
        return Err(day_starts_at_error(value));
    }

    if !bytes[0].is_ascii_digit()
        || !bytes[1].is_ascii_digit()
        || !bytes[3].is_ascii_digit()
        || !bytes[4].is_ascii_digit()
    {
        return Err(day_starts_at_error(value));
    }

    let hours: u32 = value[0..2].parse().map_err(|_| day_starts_at_error(value))?;
    let minutes: u32 = value[3..5].parse().map_err(|_| day_starts_at_error(value))?;

    if hours > 23 {
        return Err(AppError::new(
            error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
            Some(format!("Invalid hours: {}", hours)),
        ));
    }

    if minutes > 59 {
        return Err(AppError::new(
            error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
            Some(format!("Invalid minutes: {}", minutes)),
        ));
    }

    Ok((hours, minutes))
}

fn day_starts_at_error(value: &str) -> AppError {
    AppError::new(
        error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
        Some(format!("Invalid time format: {}", value)),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyLimits {
    pub total: u32,
    pub untouched: CountedDailyLimit,
    pub learn: CountedDailyLimit,
    pub review: CountedDailyLimit,
}

impl DailyLimits {
    fn validate(&self) -> Result<(), AppError> {
        if self.total == 0 {
            return Ok(());
        }
        if self.untouched.counts && self.untouched.value > self.total {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_UNTOUCHED_EXCEEDS_TOTAL,
                None,
            ));
        }
        if self.learn.counts && self.learn.value > self.total {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_LEARN_EXCEEDS_TOTAL,
                None,
            ));
        }
        if self.review.counts && self.review.value > self.total {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_REVIEW_EXCEEDS_TOTAL,
                None,
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountedDailyLimit {
    pub value: u32,
    pub counts: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", untagged)]
enum CountedDailyLimitInput {
    Value(u32),
    Object { value: u32, counts: bool },
}

impl<'de> Deserialize<'de> for CountedDailyLimit {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        match CountedDailyLimitInput::deserialize(deserializer)? {
            CountedDailyLimitInput::Value(value) => Ok(Self { value, counts: true }),
            CountedDailyLimitInput::Object { value, counts } => Ok(Self { value, counts }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnAheadLimit(
    pub u32, // hours
    pub u32, // minutes
);

impl LearnAheadLimit {
    fn validate(&self) -> Result<(), AppError> {
        if self.0 > 48 {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_LEARN_AHEAD_LIMIT_HOURS_RANGE,
                Some(format!("Hours out of range: {}", self.0)),
            ));
        }
        if self.1 > 59 {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_LEARN_AHEAD_LIMIT_MINUTES_RANGE,
                Some(format!("Minutes out of range: {}", self.1)),
            ));
        }
        Ok(())
    }
}
