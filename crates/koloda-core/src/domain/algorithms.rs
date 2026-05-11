use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app::error::{error_codes, AppError};
use crate::app::utility::{serialize_optional_timestamp, serialize_timestamp};
use crate::domain::algorithms_fsrs::AlgorithmFSRS;

const TITLE_MIN_LENGTH: usize = 1;
const TITLE_MAX_LENGTH: usize = 255;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Algorithm {
    pub id: i64,
    pub title: String,
    pub content: Value,
    #[serde(serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertAlgorithmData {
    pub title: String,
    pub content: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAlgorithmValues {
    pub title: String,
    pub content: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAlgorithmData {
    pub id: i64,
    pub values: UpdateAlgorithmValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneAlgorithmData {
    pub title: String,
    pub source_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAlgorithmData {
    pub id: i64,
    pub successor_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlgorithmDeck {
    pub id: i64,
    pub title: String,
}

impl InsertAlgorithmData {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)?;
        validate_algorithm_content(&self.content)
    }
}

impl UpdateAlgorithmValues {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)?;
        validate_algorithm_content(&self.content)
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

fn validate_algorithm_content(content: &Value) -> Result<(), AppError> {
    let algorithm_type = content
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::new(error_codes::UNKNOWN, Some("Missing field: type".to_string())))?;

    match algorithm_type {
        "fsrs" => {
            let fsrs: AlgorithmFSRS = serde_json::from_value(content.clone())?;
            fsrs.validate()
        }
        _ => Err(AppError::new(
            error_codes::UNKNOWN,
            Some(format!("Unknown algorithm type: {}", algorithm_type)),
        )),
    }
}
