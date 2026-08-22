mod common;

use common::{
    empty_optional_field_content, empty_required_field_content, missing_optional_field_content,
    missing_required_field_content, valid_card_content, valid_template_fields,
};
use koloda_core::domain::cards::InsertCardData;
use serde_json::json;

// ============================================================================
// INSERT CARD DATA - MISSING FIELDS
// ============================================================================

#[test]
fn test_insert_card_data_missing_deck_id() {
    let data = json!({
        "templateId": 1,
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_missing_template_id() {
    let data = json!({
        "deckId": 1,
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_missing_content() {
    let data = json!({
        "deckId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

// ============================================================================
// INSERT CARD DATA - EXTRA FIELDS
// ============================================================================

#[test]
fn test_insert_card_data_extra_fields_ok() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "nonexistent": "ignored",
        "another": 123
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap();
}

// ============================================================================
// INSERT CARD DATA - INVALID TYPES
// ============================================================================

#[test]
fn test_insert_card_data_deck_id_invalid_type() {
    let data = json!({
        "deckId": "not-a-number",
        "templateId": 1,
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_template_id_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": "not-a-number",
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_content_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": "not-an-object"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_content_field_text_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": {
            "1": { "text": 123 },
            "2": { "text": "Back text" }
        }
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_state_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "state": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_due_at_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "dueAt": "not-a-timestamp"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_stability_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "stability": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_difficulty_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "difficulty": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_scheduled_days_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "scheduledDays": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_learning_steps_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "learningSteps": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_reps_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "reps": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_lapses_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "lapses": "not-a-number"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

#[test]
fn test_insert_card_data_last_reviewed_at_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content(),
        "lastReviewedAt": "not-a-timestamp"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    result.unwrap_err();
}

// ============================================================================
// INSERT CARD DATA - CONTENT VALIDATION
// ============================================================================

#[test]
fn test_insert_card_content_valid_ok() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    let card_data = result.unwrap();
    card_data.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_insert_card_content_required_field_empty_fails() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": empty_required_field_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    let card_data = result.unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}

#[test]
fn test_insert_card_content_required_field_missing_fails() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": missing_required_field_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    let card_data = result.unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}

#[test]
fn test_insert_card_content_optional_field_empty_ok() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": empty_optional_field_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    let card_data = result.unwrap();
    card_data.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_insert_card_content_optional_field_missing_ok() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": missing_optional_field_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    let card_data = result.unwrap();
    card_data.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_insert_card_content_unicode_ok() {
    let unicode_content = json!({
        "1": { "text": "こんにちは世界 🌍" },
        "2": { "text": "Привет мир 🎴" }
    });
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": unicode_content
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    let card_data = result.unwrap();
    card_data.validate(&valid_template_fields()).unwrap();
}

// ============================================================================
// INSERT CARD DATA - PROGRESS VALIDATION
// ============================================================================

fn minimal_insert_card_data() -> serde_json::Value {
    json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content()
    })
}

#[test]
fn test_insert_card_progress_defaults_valid() {
    let card_data = serde_json::from_value::<InsertCardData>(minimal_insert_card_data()).unwrap();
    card_data.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_insert_card_progress_state_above_max_fails() {
    let mut data = minimal_insert_card_data();
    data["state"] = json!(4);
    let card_data = serde_json::from_value::<InsertCardData>(data).unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

#[test]
fn test_insert_card_progress_reps_negative_fails() {
    let mut data = minimal_insert_card_data();
    data["reps"] = json!(-1);
    let card_data = serde_json::from_value::<InsertCardData>(data).unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.reps");
}

#[test]
fn test_insert_card_progress_stability_negative_fails() {
    let mut data = minimal_insert_card_data();
    data["stability"] = json!(-1.0);
    let card_data = serde_json::from_value::<InsertCardData>(data).unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.stability"
    );
}

#[test]
fn test_insert_card_progress_difficulty_above_max_fails() {
    let mut data = minimal_insert_card_data();
    data["difficulty"] = json!(10.1);
    let card_data = serde_json::from_value::<InsertCardData>(data).unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}
