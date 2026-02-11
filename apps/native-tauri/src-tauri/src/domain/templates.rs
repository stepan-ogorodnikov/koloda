use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};
use crate::app::utility::{serialize_optional_timestamp, serialize_timestamp};

const TITLE_MIN_LENGTH: usize = 1;
const TITLE_MAX_LENGTH: usize = 255;

const FIELD_TYPES: &[&str] = &["text"];
const LAYOUT_OPERATIONS: &[&str] = &["display", "reveal", "type"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: i64,
    pub title: String,
    pub content: TemplateContent,
    pub is_locked: bool,
    #[serde(serialize_with = "serialize_timestamp")]
    pub created_at: i64,
    #[serde(default, serialize_with = "serialize_optional_timestamp")]
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateContent {
    pub fields: Vec<TemplateField>,
    pub layout: Vec<TemplateLayoutItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateField {
    pub id: i64,
    pub title: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub is_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateLayoutItem {
    pub field: i64,
    pub operation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertTemplateData {
    pub title: String,
    pub content: TemplateContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTemplateValues {
    pub title: String,
    pub content: TemplateContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTemplateData {
    pub id: i64,
    pub values: UpdateTemplateValues,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneTemplateData {
    pub title: String,
    pub source_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTemplateData {
    pub id: i64,
    pub successor_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDeck {
    pub id: i64,
    pub title: String,
}

impl InsertTemplateData {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_title(&self.title)?;
        validate_template_content(&self.content, None)
    }
}

impl UpdateTemplateValues {
    pub fn validate(&self, original: Option<&TemplateContent>) -> Result<(), AppError> {
        validate_title(&self.title)?;
        validate_template_content(&self.content, original)
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

fn validate_template_content(
    content: &TemplateContent,
    original: Option<&TemplateContent>, // Some - template is locked, None - not locked
) -> Result<(), AppError> {
    if content.fields.is_empty() {
        return Err(AppError::new(error_codes::VALIDATION_TEMPLATES_FIELDS_TOO_FEW, None));
    }

    if content.layout.is_empty() {
        return Err(AppError::new(error_codes::VALIDATION_TEMPLATES_LAYOUT_TOO_FEW, None));
    }

    for field in &content.fields {
        if !FIELD_TYPES.contains(&field.field_type.as_str()) {
            return Err(AppError::new(
                error_codes::UNKNOWN,
                Some(format!("Invalid field type: {}", field.field_type)),
            ));
        }
    }

    for item in &content.layout {
        if !LAYOUT_OPERATIONS.contains(&item.operation.as_str()) {
            return Err(AppError::new(
                error_codes::UNKNOWN,
                Some(format!("Invalid layout operation: {}", item.operation)),
            ));
        }
    }

    let field_ids: std::collections::HashSet<i64> = content.fields.iter().map(|f| f.id).collect();
    for item in &content.layout {
        if !field_ids.contains(&item.field) {
            return Err(AppError::new(
                error_codes::UNKNOWN,
                Some(format!("Non-existent field id in layout: {}", item.field)),
            ));
        }
    }

    if let Some(orig) = original {
        validate_locked_template_fields(&orig.fields, &content.fields)?;
    }

    Ok(())
}

fn validate_locked_template_fields(original: &[TemplateField], updated: &[TemplateField]) -> Result<(), AppError> {
    let updated_ids: std::collections::HashSet<i64> = updated.iter().map(|f| f.id).collect();

    // Check if all original fields are present
    for orig_field in original {
        if !updated_ids.contains(&orig_field.id) {
            return Err(AppError::new(
                error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED,
                Some(format!("Missing field with id: {}", orig_field.id)),
            ));
        }
    }

    // Check if properties (except 'title') are not changed for existing fields
    for orig_field in original {
        if let Some(updated_field) = updated.iter().find(|f| f.id == orig_field.id) {
            // Check type property
            if updated_field.field_type != orig_field.field_type {
                return Err(AppError::new(
                    error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED,
                    Some(format!("Cannot change field type for field id: {}", orig_field.id)),
                ));
            }
            // Check is_required property
            if updated_field.is_required != orig_field.is_required {
                return Err(AppError::new(
                    error_codes::VALIDATION_TEMPLATES_UPDATE_LOCKED,
                    Some(format!("Cannot change 'isRequired' for field id: {}", orig_field.id)),
                ));
            }
        }
    }

    Ok(())
}
