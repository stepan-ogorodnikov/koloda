//! `settings.learning` slice — mirrors `@koloda/app` `learningSettingsValidation`.
//!
//! `day_starts_at` must use zero-padded `hh:mm`; keep in sync with TS `parseDayStartsAt`.
//! Missing-field defaults mirror the TS `.default()`s: `dailyLimits.total` 200,
//! `untouched` {50, true}, `learn` {0, false}, `review` {200, true},
//! `dayStartsAt` "05:00", `learnAheadLimit` [0, 30]. The `dailyLimits` key
//! itself stays required, same as the TS twin (only its contents default).
//! Daily-limit caps are `Option<u32>`: `None` is unlimited, `Some(0)` is a hard
//! zero.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::app::error::{error_codes, AppError};
use crate::domain::common::validate_uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningDefaults {
    #[serde(default)]
    pub algorithm: String,
    #[serde(default)]
    pub template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningSettings {
    pub defaults: LearningDefaults,
    // WHY: no serde default — the TS twin also requires the `dailyLimits`
    // key; only its contents are defaulted (see `DailyLimits`).
    pub daily_limits: DailyLimits,
    #[serde(default = "default_day_starts_at")]
    pub day_starts_at: String,
    #[serde(default = "default_learn_ahead_limit")]
    pub learn_ahead_limit: LearnAheadLimit,
}

impl LearningSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        self.defaults.validate()?;
        self.daily_limits.validate()?;
        self.learn_ahead_limit.validate()?;
        parse_day_starts_at(&self.day_starts_at)?;
        Ok(())
    }
}

impl LearningDefaults {
    fn validate(&self) -> Result<(), AppError> {
        validate_default_algorithm(&self.algorithm)?;
        validate_default_template(&self.template)?;
        Ok(())
    }
}

// INVARIANT: each key check reads one key's value as `LearningSettings` reads that key, and runs the check `validate`
// runs on it. Remote apply holds a learning value that fails its check, so the stored document always reads
// (crates/koloda-sync-proto/PROTOCOL.md, Corrupt envelopes).
pub fn validate_default_algorithm(id: &str) -> Result<(), AppError> {
    validate_uuid(id, error_codes::VALIDATION_SETTINGS_LEARNING_DEFAULTS_ALGORITHM)
}

pub fn validate_default_template(id: &str) -> Result<(), AppError> {
    validate_uuid(id, error_codes::VALIDATION_SETTINGS_LEARNING_DEFAULTS_TEMPLATE)
}

pub fn validate_daily_limits(value: &Value) -> Result<(), AppError> {
    DailyLimits::deserialize(value)?.validate()
}

pub fn validate_day_starts_at(value: &Value) -> Result<(), AppError> {
    parse_day_starts_at(&String::deserialize(value)?).map(|_| ())
}

pub fn validate_learn_ahead_limit(value: &Value) -> Result<(), AppError> {
    LearnAheadLimit::deserialize(value)?.validate()
}

// INVARIANT: on `Ok`, returns `(hours, minutes)` with `0 <= hours <= 23` and `0 <= minutes <= 59`.
// Callers (`learning_day_range_at`) rely on this to construct a `NaiveTime` without re-validating.
pub fn parse_day_starts_at(value: &str) -> Result<(u32, u32), AppError> {
    let [h0, h1, colon, m0, m1] = value.as_bytes() else {
        return Err(day_starts_at_error(value));
    };
    if *colon != b':' || !h0.is_ascii_digit() || !h1.is_ascii_digit() || !m0.is_ascii_digit() || !m1.is_ascii_digit() {
        return Err(day_starts_at_error(value));
    }

    let hours = u32::from(*h0 - b'0') * 10 + u32::from(*h1 - b'0');
    let minutes = u32::from(*m0 - b'0') * 10 + u32::from(*m1 - b'0');

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
    #[serde(default = "default_daily_limits_total")]
    pub total: Option<u32>,
    #[serde(
        default = "default_untouched_limit",
        deserialize_with = "deserialize_untouched_limit"
    )]
    pub untouched: CountedDailyLimit,
    #[serde(default = "default_learn_limit", deserialize_with = "deserialize_learn_limit")]
    pub learn: CountedDailyLimit,
    #[serde(default = "default_review_limit", deserialize_with = "deserialize_review_limit")]
    pub review: CountedDailyLimit,
}

impl DailyLimits {
    fn validate(&self) -> Result<(), AppError> {
        if counted_exceeds_total(self.total, &self.untouched) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_UNTOUCHED_EXCEEDS_TOTAL,
                None,
            ));
        }
        if counted_exceeds_total(self.total, &self.learn) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_LEARN_EXCEEDS_TOTAL,
                None,
            ));
        }
        if counted_exceeds_total(self.total, &self.review) {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_REVIEW_EXCEEDS_TOTAL,
                None,
            ));
        }
        Ok(())
    }
}

fn counted_exceeds_total(total: Option<u32>, limit: &CountedDailyLimit) -> bool {
    match (total, limit.counts, limit.value) {
        (None, _, _) | (_, false, _) | (_, _, None) => false,
        (Some(total), true, Some(value)) => value > total,
    }
}

pub fn is_finite_daily_limit_over(limit: Option<u32>, used: i64, at_limit: bool) -> bool {
    let Some(limit) = limit else {
        return false;
    };
    if used <= 0 {
        return false;
    }
    if at_limit {
        used >= i64::from(limit)
    } else {
        used > i64::from(limit)
    }
}

pub fn is_bucket_over_daily_limit(
    counted: bool,
    bucket: i64,
    bucket_limit: Option<u32>,
    total: i64,
    total_limit: Option<u32>,
) -> bool {
    bucket > 0
        && (is_finite_daily_limit_over(bucket_limit, bucket, false)
            || (counted && is_finite_daily_limit_over(total_limit, total, true)))
}

// WHY: TS defaults mirrored from `learningSettingsValidation` / `dailyLimitsValidation`.
// Serde `default` fills missing keys only (explicit `null` still fails),
// matching Zod `.default()`; the per-limit `deserialize_with` wrappers below
// additionally map present `null`/partial objects the way the TS
// `z.preprocess` (`value ?? {}` + per-field defaults) does.
fn default_daily_limits_total() -> Option<u32> {
    Some(200)
}

fn default_untouched_limit() -> CountedDailyLimit {
    CountedDailyLimit {
        value: Some(50),
        counts: true,
    }
}

fn default_learn_limit() -> CountedDailyLimit {
    CountedDailyLimit {
        value: Some(0),
        counts: false,
    }
}

fn default_review_limit() -> CountedDailyLimit {
    CountedDailyLimit {
        value: Some(200),
        counts: true,
    }
}

fn default_day_starts_at() -> String {
    "05:00".to_owned()
}

fn default_learn_ahead_limit() -> LearnAheadLimit {
    LearnAheadLimit(0, 30)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountedDailyLimit {
    pub value: Option<u32>,
    pub counts: bool,
}

#[derive(Debug, Default)]
enum OptionalLimitValue {
    #[default]
    Missing,
    Unlimited,
    Capped(u32),
}

impl<'de> Deserialize<'de> for OptionalLimitValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match Option::<u32>::deserialize(deserializer)? {
            None => OptionalLimitValue::Unlimited,
            Some(n) => OptionalLimitValue::Capped(n),
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", untagged)]
enum CountedDailyLimitPartial {
    Value(u32),
    Object {
        #[serde(default)]
        value: OptionalLimitValue,
        #[serde(default)]
        counts: Option<bool>,
    },
}

fn deserialize_counted_limit_with<'de, D>(
    deserializer: D,
    default_value: u32,
    default_counts: bool,
) -> Result<CountedDailyLimit, D::Error>
where
    D: Deserializer<'de>,
{
    // WHY: `Option` outer maps explicit `null` to per-type defaults, mirroring
    // TS `value ?? {}`. Numeric shorthand always counts, same as the TS
    // preprocess (`{ value, counts: true }` regardless of the type default).
    // Object `value: null` is unlimited (`None`); missing `value` uses the type default.
    // Do not map per-type `0` to unlimited.
    match Option::<CountedDailyLimitPartial>::deserialize(deserializer)? {
        None => Ok(CountedDailyLimit {
            value: Some(default_value),
            counts: default_counts,
        }),
        Some(CountedDailyLimitPartial::Value(value)) => Ok(CountedDailyLimit {
            value: Some(value),
            counts: true,
        }),
        Some(CountedDailyLimitPartial::Object { value, counts }) => Ok(CountedDailyLimit {
            value: match value {
                OptionalLimitValue::Missing => Some(default_value),
                OptionalLimitValue::Unlimited => None,
                OptionalLimitValue::Capped(n) => Some(n),
            },
            counts: counts.unwrap_or(default_counts),
        }),
    }
}

fn deserialize_untouched_limit<'de, D>(deserializer: D) -> Result<CountedDailyLimit, D::Error>
where
    D: Deserializer<'de>,
{
    deserialize_counted_limit_with(deserializer, 50, true)
}

fn deserialize_learn_limit<'de, D>(deserializer: D) -> Result<CountedDailyLimit, D::Error>
where
    D: Deserializer<'de>,
{
    deserialize_counted_limit_with(deserializer, 0, false)
}

fn deserialize_review_limit<'de, D>(deserializer: D) -> Result<CountedDailyLimit, D::Error>
where
    D: Deserializer<'de>,
{
    deserialize_counted_limit_with(deserializer, 200, true)
}

/// Tuple fields are (hours, minutes).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnAheadLimit(pub u32, pub u32);

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
