use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::app::error::{error_codes, AppError};
use crate::app::utility::{
    default_now, deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp,
    serialize_timestamp,
};
use crate::domain::templates::TemplateField;

pub type CardContent = HashMap<String, CardContentField>;

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
