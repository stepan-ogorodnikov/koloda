use serde::{Deserialize, Serialize};

#[allow(dead_code)]
pub mod error_codes {
    pub const UNKNOWN: &str = "unknown";

    pub const DB_GET: &str = "db.get";
    pub const DB_ADD: &str = "db.add";
    pub const DB_UPDATE: &str = "db.update";
    pub const DB_DELETE: &str = "db.delete";
    pub const DB_CLONE: &str = "db.clone";

    pub const NOT_FOUND_ALGORITHMS_CLONE_SOURCE: &str = "not-found.algorithms.clone.source";
    pub const NOT_FOUND_ALGORITHMS_DELETE_SUCCESSOR: &str = "not-found.algorithms.delete.successor";
    pub const NOT_FOUND_TEMPLATES_CLONE_SOURCE: &str = "not-found.templates.clone.source";
    pub const NOT_FOUND_CARDS_ADD_TEMPLATE: &str = "not-found.cards.add.template";
    pub const NOT_FOUND_CARDS_UPDATE_CARD: &str = "not-found.cards.update.card";
    pub const NOT_FOUND_CARDS_UPDATE_TEMPLATE: &str = "not-found.cards.update.template";

    pub const VALIDATION_COMMON_TITLE_TOO_SHORT: &str = "validation.common.title.too-short";
    pub const VALIDATION_COMMON_TITLE_TOO_LONG: &str = "validation.common.title.too-long";

    pub const VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_UNTOUCHED_EXCEEDS_TOTAL: &str =
        "validation.settings-learning.daily-limits.untouched-exceeds-total";
    pub const VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_LEARN_EXCEEDS_TOTAL: &str =
        "validation.settings-learning.daily-limits.learn-exceeds-total";
    pub const VALIDATION_SETTINGS_LEARNING_DAILY_LIMITS_REVIEW_EXCEEDS_TOTAL: &str =
        "validation.settings-learning.daily-limits.review-exceeds-total";
    pub const VALIDATION_SETTINGS_LEARNING_LEARN_AHEAD_LIMIT_HOURS_RANGE: &str =
        "validation.settings-learning.learn-ahead-limit.hours-range";
    pub const VALIDATION_SETTINGS_LEARNING_LEARN_AHEAD_LIMIT_MINUTES_RANGE: &str =
        "validation.settings-learning.learn-ahead-limit.minutes-range";
    pub const VALIDATION_SETTINGS_LEARNING_DAY_STARTS_AT: &str = "validation.settings-learning.day-starts-at";

    pub const VALIDATION_SETTINGS_HOTKEYS_DUPLICATE_KEYS: &str = "validation.settings-hotkeys.duplicate-keys";

    pub const VALIDATION_SETTINGS_INTERFACE_LANGUAGE: &str = "validation.settings-interface.language";
    pub const VALIDATION_SETTINGS_INTERFACE_THEME: &str = "validation.settings-interface.theme";
    pub const VALIDATION_SETTINGS_INTERFACE_MOTION: &str = "validation.settings-interface.motion";

    pub const VALIDATION_ALGORITHM_FSRS_RETENTION: &str = "validation.algorithm.fsrs.retention";
    pub const VALIDATION_ALGORITHM_FSRS_LEARNING_STEPS_AMOUNT: &str = "validation.algorithm.fsrs.learning-steps.amount";
    pub const VALIDATION_ALGORITHM_FSRS_LEARNING_STEPS_UNIT: &str = "validation.algorithm.fsrs.learning-steps.unit";
    pub const VALIDATION_ALGORITHM_FSRS_RELEARNING_STEPS_AMOUNT: &str =
        "validation.algorithm.fsrs.relearning-steps.amount";
    pub const VALIDATION_ALGORITHM_FSRS_RELEARNING_STEPS_UNIT: &str = "validation.algorithm.fsrs.relearning-steps.unit";
    pub const VALIDATION_ALGORITHM_FSRS_MAXIMUM_INTERVAL: &str = "validation.algorithm.fsrs.maximum-interval";
    pub const VALIDATION_ALGORITHM_FSRS_WEIGHTS: &str = "validation.algorithm.fsrs.weights";

    pub const VALIDATION_TEMPLATES_FIELDS_TOO_FEW: &str = "validation.templates.fields.too-few";
    pub const VALIDATION_TEMPLATES_LAYOUT_TOO_FEW: &str = "validation.templates.layout.too-few";
    pub const VALIDATION_TEMPLATES_UPDATE_LOCKED: &str = "validation.templates.update-locked";
    pub const VALIDATION_TEMPLATES_DELETE_LOCKED: &str = "validation.templates.delete-locked";

    pub const VALIDATION_CARDS_CONTENT_FIELD_EMPTY: &str = "validation.cards.content.field-empty";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub details: Option<String>,
}

impl AppError {
    pub fn new(code: &str, details: Option<String>) -> Self {
        Self {
            code: code.to_string(),
            details,
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self {
            code: error_codes::UNKNOWN.to_string(),
            details: Some(format!("IO error: {:?}", err)),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self {
            code: error_codes::UNKNOWN.to_string(),
            details: Some(err.to_string()),
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        Self {
            code: error_codes::UNKNOWN.to_string(),
            details: Some(format!("Database error: {:?}", err)),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self {
            code: error_codes::UNKNOWN.to_string(),
            details: Some(format!("JSON error: {:?}", err)),
        }
    }
}

impl From<refinery::Error> for AppError {
    fn from(err: refinery::Error) -> Self {
        Self {
            code: error_codes::UNKNOWN.to_string(),
            details: Some(format!("Migration error: {:?}", err)),
        }
    }
}

pub fn from_db_lock_error(_err: std::sync::PoisonError<std::sync::MutexGuard<'_, rusqlite::Connection>>) -> AppError {
    AppError {
        code: error_codes::UNKNOWN.to_string(),
        details: Some("Database lock poisoned".to_string()),
    }
}
