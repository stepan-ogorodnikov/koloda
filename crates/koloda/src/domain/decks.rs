//! Deck rows — mirrors `@koloda/srs` `deckValidation`.

use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};
use crate::domain::common::{validate_notes, validate_title, validate_uuid};
use crate::domain::time::{
    deserialize_optional_timestamp, deserialize_timestamp, serialize_optional_timestamp, serialize_timestamp,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: String,
    pub title: String,
    pub algorithm_id: String,
    pub template_id: String,
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
pub struct InsertDeckData {
    pub title: String,
    pub algorithm_id: String,
    pub template_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeckValues {
    pub title: String,
    pub algorithm_id: String,
    pub template_id: String,
    // WHY: full-update semantics like the TS layer — None clears the note (stores NULL).
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeckData {
    pub id: String,
    pub values: UpdateDeckValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDeckData {
    pub id: String,
}

impl InsertDeckData {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)?;
        validate_uuid(&self.algorithm_id, error_codes::VALIDATION_DECKS_ALGORITHM)?;
        validate_uuid(&self.template_id, error_codes::VALIDATION_DECKS_TEMPLATE)?;
        Ok(())
    }
}

impl UpdateDeckValues {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)?;
        validate_uuid(&self.algorithm_id, error_codes::VALIDATION_DECKS_ALGORITHM)?;
        validate_uuid(&self.template_id, error_codes::VALIDATION_DECKS_TEMPLATE)?;
        validate_notes(self.notes.as_deref())?;
        Ok(())
    }
}
