//! SRS algorithms — mirrors `@koloda/srs` `algorithmValidation`. Content shape is `AlgorithmFSRS`.

use serde::{Deserialize, Serialize};

use crate::app::error::AppError;
use crate::domain::algorithms_fsrs::AlgorithmFSRS;
use crate::domain::common::{validate_notes, validate_title};
use crate::domain::time::{
    deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp, serialize_timestamp,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Algorithm {
    pub id: String,
    pub title: String,
    pub content: AlgorithmFSRS,
    // WHY: absent notes round-trip as NULL — `default` accepts a missing key on the wire.
    #[serde(default)]
    pub notes: Option<String>,
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
    // WHY: full-update semantics like the TS layer — None clears the note (stores NULL).
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAlgorithmData {
    pub id: String,
    pub values: UpdateAlgorithmValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneAlgorithmData {
    pub title: String,
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAlgorithmData {
    pub id: String,
    pub successor_id: Option<String>,
}

/// Who changed an algorithm's parameters, stored as JSON tagged by `kind` (TS twin: `AlgorithmRevisionActor`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AlgorithmRevisionActor {
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlgorithmDeck {
    pub id: String,
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
        validate_notes(self.notes.as_deref())?;
        self.content.validate()
    }
}
