use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::app::error::{error_codes, AppError};
use crate::app::utility::{
    default_now, deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp,
    serialize_timestamp,
};
use crate::domain::templates::TemplateField;

pub type CardContent = HashMap<String, CardContentField>;

const STATE_MIN: i32 = 0;
const STATE_MAX: i32 = 3;
const DIFFICULTY_MIN: f64 = 0.0;
const DIFFICULTY_MAX: f64 = 10.0;

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
pub struct ResetCardProgressData {
    pub id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCardsParams {
    pub deck_id: i64,
}

impl InsertCardData {
    pub fn validate(&self, template_fields: &[TemplateField]) -> Result<(), AppError> {
        validate_content(&self.content, template_fields)
    }
}

impl UpdateCardValues {
    pub fn validate(&self, template_fields: &[TemplateField]) -> Result<(), AppError> {
        validate_content(&self.content, template_fields)
    }
}

impl UpdateCardProgress {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_state(self.state)?;
        validate_stability(self.stability)?;
        validate_difficulty(self.difficulty)?;
        validate_scheduled_days(self.scheduled_days)?;
        validate_learning_steps(self.learning_steps)?;
        validate_reps(self.reps)?;
        validate_lapses(self.lapses)?;
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

fn validate_state(state: i32) -> Result<(), AppError> {
    if !(STATE_MIN..=STATE_MAX).contains(&state) {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_STATE,
            Some(format!(
                "State must be between {} and {}, got {}",
                STATE_MIN, STATE_MAX, state
            )),
        ));
    }
    Ok(())
}

fn validate_stability(stability: f64) -> Result<(), AppError> {
    if stability < 0.0 {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_STABILITY,
            Some(format!("Stability must be non-negative, got {}", stability)),
        ));
    }
    Ok(())
}

fn validate_difficulty(difficulty: f64) -> Result<(), AppError> {
    if !(DIFFICULTY_MIN..=DIFFICULTY_MAX).contains(&difficulty) {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_DIFFICULTY,
            Some(format!(
                "Difficulty must be between {} and {}, got {}",
                DIFFICULTY_MIN, DIFFICULTY_MAX, difficulty
            )),
        ));
    }
    Ok(())
}

fn validate_scheduled_days(days: i32) -> Result<(), AppError> {
    if days < 0 {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_SCHEDULED_DAYS,
            Some(format!("Scheduled days must be non-negative, got {}", days)),
        ));
    }
    Ok(())
}

fn validate_learning_steps(steps: i32) -> Result<(), AppError> {
    if steps < 0 {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_LEARNING_STEPS,
            Some(format!("Learning steps must be non-negative, got {}", steps)),
        ));
    }
    Ok(())
}

fn validate_reps(reps: i32) -> Result<(), AppError> {
    if reps < 0 {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_REPS,
            Some(format!("Reps must be non-negative, got {}", reps)),
        ));
    }
    Ok(())
}

fn validate_lapses(lapses: i32) -> Result<(), AppError> {
    if lapses < 0 {
        return Err(AppError::new(
            error_codes::VALIDATION_CARDS_PROGRESS_LAPSES,
            Some(format!("Lapses must be non-negative, got {}", lapses)),
        ));
    }
    Ok(())
}
