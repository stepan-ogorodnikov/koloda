//! Lesson query DTOs — mirrors `@koloda/srs` lesson types used by `repo::lessons` raw SQL.

use serde::{Deserialize, Serialize};

use super::templates::TemplateField;
use crate::app::error::error_codes;
use crate::app::error::AppError;
use crate::domain::algorithms_fsrs::AlgorithmFSRS;
use crate::domain::cards::{Card, UpdateCardProgress};
use crate::domain::decks::Deck;
use crate::domain::reviews::InsertReviewData;
use crate::domain::time::{default_now, deserialize_timestamp};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonDeck {
    pub id: String,
    pub title: String,
    pub untouched: i64,
    pub learn: i64,
    pub review: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonsResult {
    pub total: LessonAmounts,
    pub decks: Vec<LessonDeck>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonFilters {
    pub deck_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LessonAmounts {
    pub untouched: i64,
    pub learn: i64,
    pub review: i64,
    pub total: i64,
}

impl LessonAmounts {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_lesson_amount(self.untouched)?;
        validate_lesson_amount(self.learn)?;
        validate_lesson_amount(self.review)?;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonTemplateLayoutItem {
    pub field: Option<TemplateField>,
    pub operation: String,
    pub field_id: String,
}

// The lesson session consumes `layout` only; title and timestamps stay on the admin template.
// Twin of `@koloda/srs` `LessonTemplate`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonTemplate {
    pub id: String,
    pub layout: Vec<LessonTemplateLayoutItem>,
}

// Slim projection for grading — the session reads `content` only. Twin of web `LessonAlgorithm`
// (`lessonAlgorithmRowSchema` in `@koloda/srs`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonAlgorithm {
    pub id: String,
    pub content: AlgorithmFSRS,
}

// INVARIANT: loaders return `None` when no cards match — never an empty struct.
// Twin of web SQLite `null`; NAPI/IPC is `Option` / `LessonData | null`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonData {
    pub cards: Vec<Card>,
    pub decks: Vec<Deck>,
    pub templates: Vec<LessonTemplate>,
    pub algorithms: Vec<LessonAlgorithm>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLessonDataParams {
    #[serde(default = "default_now", deserialize_with = "deserialize_timestamp")]
    pub due_at: i64,
    pub filters: LessonFilters,
    pub amounts: LessonAmounts,
}

impl GetLessonDataParams {
    pub fn validate(&self) -> Result<(), AppError> {
        self.amounts.validate()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonResultData {
    pub card: UpdateCardProgress,
    pub review: InsertReviewData,
}

impl LessonResultData {
    pub fn validate(&self) -> Result<(), AppError> {
        self.card.validate()?;
        self.review.validate()?;

        if self.card.id != self.review.card_id {
            return Err(AppError::new(
                error_codes::VALIDATION_LESSONS_RESULT_CARD_REVIEW_MISMATCH,
                None,
            ));
        }

        Ok(())
    }
}

fn validate_lesson_amount(value: i64) -> Result<(), AppError> {
    if value < 0 {
        return Err(AppError::new(error_codes::VALIDATION_LESSONS_AMOUNTS_NEGATIVE, None));
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLessonsParams {
    #[serde(default = "default_now", deserialize_with = "deserialize_timestamp")]
    pub due_at: i64,
    pub filters: Option<LessonFilters>,
}
