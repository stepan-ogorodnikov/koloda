use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};
use crate::app::utility::{serialize_optional_timestamp, serialize_timestamp};

const TITLE_MIN_LENGTH: usize = 1;
const TITLE_MAX_LENGTH: usize = 255;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: i64,
    pub title: String,
    pub algorithm_id: i64,
    pub template_id: i64,
    #[serde(serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertDeckData {
    pub title: String,
    pub algorithm_id: i64,
    pub template_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeckValues {
    pub title: String,
    pub algorithm_id: i64,
    pub template_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeckData {
    pub id: i64,
    pub values: UpdateDeckValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDeckData {
    pub id: i64,
}

impl InsertDeckData {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)
    }
}

impl UpdateDeckValues {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)
    }
}

fn validate_title(title: &str) -> Result<(), AppError> {
    if title.len() < TITLE_MIN_LENGTH {
        return Err(AppError::new(
            error_codes::VALIDATION_COMMON_TITLE_TOO_SHORT,
            Some(format!("Min length: {}", TITLE_MIN_LENGTH)),
        ));
    }

    if title.len() > TITLE_MAX_LENGTH {
        return Err(AppError::new(
            error_codes::VALIDATION_COMMON_TITLE_TOO_LONG,
            Some(format!("Max length: {}", TITLE_MAX_LENGTH)),
        ));
    }

    Ok(())
}
