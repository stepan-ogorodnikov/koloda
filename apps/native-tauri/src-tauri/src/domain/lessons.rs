use serde::{Deserialize, Serialize};

use super::templates::TemplateField;
use crate::app::utility::{default_now, serialize_optional_timestamp, serialize_timestamp};
use crate::domain::cards::{Card, UpdateCardProgress};
use crate::domain::decks::Deck;
use crate::domain::reviews::InsertReviewData;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    pub id: Option<i64>,
    pub title: Option<String>,
    pub untouched: i64,
    pub learn: i64,
    pub review: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LessonFilters {
    pub deck_ids: Option<Vec<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonAmounts {
    pub untouched: i64,
    pub learn: i64,
    pub review: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonTemplateLayoutItem {
    pub field: Option<TemplateField>,
    pub operation: String,
    pub field_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonTemplate {
    pub id: i64,
    pub title: String,
    pub fields: Vec<TemplateField>,
    pub layout: Vec<LessonTemplateLayoutItem>,
    #[serde(serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonData {
    pub cards: Vec<Card>,
    pub decks: Vec<Deck>,
    pub templates: Vec<LessonTemplate>,
    pub algorithms: Vec<super::algorithms::Algorithm>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLessonDataParams {
    #[serde(default = "default_now")]
    pub due_at: i64,
    pub filters: LessonFilters,
    pub amounts: LessonAmounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonResultData {
    pub card: UpdateCardProgress,
    pub review: InsertReviewData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLessonsParams {
    pub due_at: i64,
    pub filters: Option<LessonFilters>,
}
