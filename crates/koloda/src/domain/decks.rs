//! Deck rows — mirrors `@koloda/srs` `deckValidation`.

use serde::{Deserialize, Serialize};

use crate::app::error::AppError;
use crate::domain::common::validate_title;
use crate::domain::time::{
    deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp, serialize_timestamp,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: i64,
    pub title: String,
    pub algorithm_id: i64,
    pub template_id: i64,
    // WHY: accepts the RFC 3339 string `serialize_timestamp` emits, so the wire shape round-trips.
    #[serde(deserialize_with = "deserialize_timestamp", serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_timestamp",
        serialize_with = "serialize_optional_timestamp"
    )]
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
