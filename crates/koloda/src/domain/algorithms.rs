//! SRS algorithms — mirrors `@koloda/srs` `algorithmValidation`. Content shape is `AlgorithmFSRS`.

use serde::{Deserialize, Serialize};

use crate::app::error::AppError;
use crate::domain::algorithms_fsrs::AlgorithmFSRS;
use crate::domain::common::validate_title;
use crate::domain::time::{
    deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp, serialize_timestamp,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Algorithm {
    pub id: i64,
    pub title: String,
    pub content: AlgorithmFSRS,
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
pub struct InsertAlgorithmData {
    pub title: String,
    pub content: AlgorithmFSRS,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAlgorithmValues {
    pub title: String,
    pub content: AlgorithmFSRS,
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
        self.content.validate()
    }
}

impl UpdateAlgorithmValues {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)?;
        self.content.validate()
    }
}
