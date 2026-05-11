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
        validate_day_starts_at(&self.day_starts_at)?;
        Ok(())
    }
}

fn validate_day_starts_at(value: &str) -> Result<(), AppError> {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() != 2 {
        return Err(AppError::new(
            error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
            Some(format!("Invalid time format: {}", value)),
        ));
    }

    let hours: u32 = parts[0].parse().map_err(|_| {
        AppError::new(
            error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
            Some(format!("Invalid hours: {}", value)),
        )
    })?;

    let minutes: u32 = parts[1].parse().map_err(|_| {
        AppError::new(
            error_codes::VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT,
            Some(format!("Invalid minutes: {}", value)),
        )
    })?;

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

    Ok(())
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
                Some(format!("Minutes out of range: {}", self.0)),
            ));
        }
        Ok(())
    }
}
