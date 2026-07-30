use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::app::error::{error_codes, AppError};
use crate::domain::progress::{
    validate_difficulty, validate_lapses, validate_learning_steps, validate_reps, validate_scheduled_days,
    validate_stability, validate_state,
};
use crate::domain::templates::TemplateField;
use crate::domain::time::{
    default_now, deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp,
    serialize_timestamp,
};

pub type CardContent = HashMap<String, CardContentField>;

/// FSRS card/review state integers stored in SQLite (mirrors `ts-fsrs` `State`).
///
/// Lesson/review SQL buckets: New → untouched; Learning+Relearning → learn; Review → review.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardState {
    New = 0,
    Learning = 1,
    Review = 2,
    Relearning = 3,
}

impl CardState {
    pub const MIN: i32 = Self::New as i32;
    pub const MAX: i32 = Self::Relearning as i32;

    pub const fn as_i32(self) -> i32 {
        self as i32
    }

    pub fn is_valid(state: i32) -> bool {
        (Self::MIN..=Self::MAX).contains(&state)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardContentField {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: i64,
    pub deck_id: i64,
    pub template_id: i64,
    pub content: CardContent,
    pub state: i32,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub due_at: Option<i64>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub scheduled_days: i32,
    pub learning_steps: i32,
    pub reps: i32,
    pub lapses: i32,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub last_reviewed_at: Option<i64>,
    #[serde(default = "default_now", serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertCardData {
    pub deck_id: i64,
    pub template_id: i64,
    pub content: CardContent,
    pub state: Option<i32>,
    #[serde(default, deserialize_with = "deserialize_optional_timestamp")]
    pub due_at: Option<i64>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub scheduled_days: Option<i32>,
    pub learning_steps: Option<i32>,
    pub reps: Option<i32>,
    pub lapses: Option<i32>,
    #[serde(default, deserialize_with = "deserialize_optional_timestamp")]
    pub last_reviewed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardValues {
    pub content: CardContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardData {
    pub id: i64,
    pub values: UpdateCardValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardProgress {
    pub id: i64,
    pub state: i32,
    #[serde(deserialize_with = "deserialize_timestamp")]
    pub due_at: i64,
    pub stability: f64,
    pub difficulty: f64,
    pub scheduled_days: i32,
    pub learning_steps: i32,
    pub reps: i32,
    pub lapses: i32,
    #[serde(default, deserialize_with = "deserialize_optional_timestamp")]
    pub last_reviewed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCardData {
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCardsData {
    pub ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetCardProgressData {
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddCardsItemResult {
    pub error: Option<String>,
}

pub type AddCardsResponse = Vec<AddCardsItemResult>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCardsParams {
    pub deck_id: i64,
}

impl InsertCardData {
    pub fn validate(&self, template_fields: &[TemplateField]) -> Result<(), AppError> {
        validate_content(&self.content, template_fields)?;
        validate_state(self.state.unwrap_or(0), error_codes::VALIDATION_CARDS_PROGRESS_STATE)?;
        if let Some(stability) = self.stability {
            validate_stability(stability, error_codes::VALIDATION_CARDS_PROGRESS_STABILITY)?;
        }
        if let Some(difficulty) = self.difficulty {
            validate_difficulty(difficulty, error_codes::VALIDATION_CARDS_PROGRESS_DIFFICULTY)?;
        }
        validate_scheduled_days(
            self.scheduled_days.unwrap_or(0),
            error_codes::VALIDATION_CARDS_PROGRESS_SCHEDULED_DAYS,
        )?;
        validate_learning_steps(
            self.learning_steps.unwrap_or(0),
            error_codes::VALIDATION_CARDS_PROGRESS_LEARNING_STEPS,
        )?;
        validate_reps(self.reps.unwrap_or(0), error_codes::VALIDATION_CARDS_PROGRESS_REPS)?;
        validate_lapses(self.lapses.unwrap_or(0), error_codes::VALIDATION_CARDS_PROGRESS_LAPSES)?;
        Ok(())
    }
}

impl UpdateCardValues {
    pub fn validate(&self, template_fields: &[TemplateField]) -> Result<(), AppError> {
        validate_content(&self.content, template_fields)
    }
}

impl UpdateCardProgress {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_state(self.state, error_codes::VALIDATION_CARDS_PROGRESS_STATE)?;
        validate_stability(self.stability, error_codes::VALIDATION_CARDS_PROGRESS_STABILITY)?;
        validate_difficulty(self.difficulty, error_codes::VALIDATION_CARDS_PROGRESS_DIFFICULTY)?;
        validate_scheduled_days(
            self.scheduled_days,
            error_codes::VALIDATION_CARDS_PROGRESS_SCHEDULED_DAYS,
        )?;
        validate_learning_steps(
            self.learning_steps,
            error_codes::VALIDATION_CARDS_PROGRESS_LEARNING_STEPS,
        )?;
        validate_reps(self.reps, error_codes::VALIDATION_CARDS_PROGRESS_REPS)?;
        validate_lapses(self.lapses, error_codes::VALIDATION_CARDS_PROGRESS_LAPSES)?;
        Ok(())
    }
}

fn validate_content(content: &CardContent, template_fields: &[TemplateField]) -> Result<(), AppError> {
    for field in template_fields {
        if field.is_required {
            let field_key = field.id.to_string();
            let field_value = content.get(&field_key).ok_or_else(|| {
                AppError::new(
                    error_codes::VALIDATION_CARDS_CONTENT_FIELD_EMPTY,
                    Some(format!("Field id: {}", field.id)),
                )
            })?;

            if field_value.text.is_empty() {
                return Err(AppError::new(
                    error_codes::VALIDATION_CARDS_CONTENT_FIELD_EMPTY,
                    Some(format!("Field id: {}", field.id)),
                ));
            }
        }
    }

    Ok(())
}
