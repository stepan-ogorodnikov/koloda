use koloda_native_tauri::domain::cards::{InsertCardData, UpdateCardProgress, UpdateCardValues};
use koloda_native_tauri::domain::templates::TemplateField;
use serde_json::json;

fn valid_template_fields() -> [TemplateField; 2] {
    [
        TemplateField {
            id: 1,
            title: "Front".to_string(),
            field_type: "text".to_string(),
            is_required: true,
        },
        TemplateField {
            id: 2,
            title: "Back".to_string(),
            field_type: "text".to_string(),
            is_required: false,
        },
    ]
}

fn valid_card_content() -> serde_json::Value {
    json!({
        "1": { "text": "Front text" },
        "2": { "text": "Back text" }
    })
}

fn empty_required_field_content() -> serde_json::Value {
    json!({
        "1": { "text": "" },
        "2": { "text": "Back text" }
    })
}

fn missing_required_field_content() -> serde_json::Value {
    json!({
        "2": { "text": "Back text" }
    })
}

fn empty_optional_field_content() -> serde_json::Value {
    json!({
        "1": { "text": "Front text" },
        "2": { "text": "" }
    })
}

fn missing_optional_field_content() -> serde_json::Value {
    json!({
        "1": { "text": "Front text" }
    })
}

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
    assert!(result.is_err());
}

#[test]
fn test_insert_card_data_missing_template_id() {
    let data = json!({
        "deckId": 1,
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    assert!(result.is_err());
}

#[test]
fn test_insert_card_data_missing_content() {
    let data = json!({
        "deckId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    assert!(result.is_err());
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
    assert!(result.is_ok());
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
    assert!(result.is_err());
}

#[test]
fn test_insert_card_data_template_id_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": "not-a-number",
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    assert!(result.is_err());
}

#[test]
fn test_insert_card_data_content_invalid_type() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": "not-an-object"
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_err());
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
    assert!(result.is_ok());
    let card_data = result.unwrap();
    assert!(card_data.validate(&valid_template_fields()).is_ok());
}

#[test]
fn test_insert_card_content_required_field_empty_fails() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": empty_required_field_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    assert!(result.is_ok());
    let card_data = result.unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let card_data = result.unwrap();
    let validation_result = card_data.validate(&valid_template_fields());
    assert!(validation_result.is_err());
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
    assert!(result.is_ok());
    let card_data = result.unwrap();
    assert!(card_data.validate(&valid_template_fields()).is_ok());
}

#[test]
fn test_insert_card_content_optional_field_missing_ok() {
    let data = json!({
        "deckId": 1,
        "templateId": 1,
        "content": missing_optional_field_content()
    });
    let result = serde_json::from_value::<InsertCardData>(data);
    assert!(result.is_ok());
    let card_data = result.unwrap();
    assert!(card_data.validate(&valid_template_fields()).is_ok());
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
    assert!(result.is_ok());
    let card_data = result.unwrap();
    assert!(card_data.validate(&valid_template_fields()).is_ok());
}

// ============================================================================
// UPDATE CARD VALUES - MISSING FIELDS
// ============================================================================

#[test]
fn test_update_card_values_missing_content() {
    let data = json!({});
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE CARD VALUES - EXTRA FIELDS
// ============================================================================

#[test]
fn test_update_card_values_extra_fields_ok() {
    let data = json!({
        "content": valid_card_content(),
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_ok());
}

// ============================================================================
// UPDATE CARD VALUES - INVALID TYPES
// ============================================================================

#[test]
fn test_update_card_values_content_invalid_type() {
    let data = json!({
        "content": "not-an-object"
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_values_content_field_text_invalid_type() {
    let data = json!({
        "content": {
            "1": { "text": 123 },
            "2": { "text": "Back text" }
        }
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE CARD VALUES - CONTENT VALIDATION
// ============================================================================

#[test]
fn test_update_card_content_valid_ok() {
    let data = json!({
        "content": valid_card_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_ok());
    let values = result.unwrap();
    assert!(values.validate(&valid_template_fields()).is_ok());
}

#[test]
fn test_update_card_content_required_field_empty_fails() {
    let data = json!({
        "content": empty_required_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_ok());
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}

#[test]
fn test_update_card_content_required_field_missing_fails() {
    let data = json!({
        "content": missing_required_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_ok());
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards.content.field-empty"
    );
}

#[test]
fn test_update_card_content_optional_field_empty_ok() {
    let data = json!({
        "content": empty_optional_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_ok());
    let values = result.unwrap();
    assert!(values.validate(&valid_template_fields()).is_ok());
}

#[test]
fn test_update_card_content_optional_field_missing_ok() {
    let data = json!({
        "content": missing_optional_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    assert!(result.is_ok());
    let values = result.unwrap();
    assert!(values.validate(&valid_template_fields()).is_ok());
}

// ============================================================================
// UPDATE CARD PROGRESS - MISSING FIELDS
// ============================================================================

#[test]
fn test_update_card_progress_missing_id() {
    let data = json!({
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_state() {
    let data = json!({
        "id": 1,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_due_at() {
    let data = json!({
        "id": 1,
        "state": 0,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_stability() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_difficulty() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_scheduled_days() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_learning_steps() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_reps() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_lapses() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_missing_last_reviewed_at_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
}

// ============================================================================
// UPDATE CARD PROGRESS - EXTRA FIELDS
// ============================================================================

#[test]
fn test_update_card_progress_extra_fields_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": null,
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
}

// ============================================================================
// UPDATE CARD PROGRESS - INVALID TYPES
// ============================================================================

#[test]
fn test_update_card_progress_id_invalid_type() {
    let data = json!({
        "id": "not-a-number",
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_state_invalid_type() {
    let data = json!({
        "id": 1,
        "state": "not-a-number",
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_due_at_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": "not-a-timestamp",
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_stability_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": "not-a-number",
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_difficulty_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": "not-a-number",
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_scheduled_days_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": "not-a-number",
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_learning_steps_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": "not-a-number",
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_reps_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": "not-a-number",
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_lapses_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": "not-a-number"
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_card_progress_last_reviewed_at_invalid_type() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
        "lastReviewedAt": "not-a-timestamp"
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE CARD PROGRESS - STATE (Dispatcher)
// ============================================================================

#[test]
fn test_update_card_progress_state_valid() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_state_all_valid() {
    for state in 0..=3 {
        let data = json!({
            "id": 1,
            "state": state,
            "dueAt": 1000000000,
            "stability": 5.0,
            "difficulty": 5.0,
            "scheduledDays": 1,
            "learningSteps": 0,
            "reps": 0,
            "lapses": 0
        });
        let result = serde_json::from_value::<UpdateCardProgress>(data);
        assert!(result.is_ok());
        assert!(result.unwrap().validate().is_ok(), "State {} should be valid", state);
    }
}

#[test]
fn test_update_card_progress_state_above_max_fails() {
    let data = json!({
        "id": 1,
        "state": 4,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

#[test]
fn test_update_card_progress_state_negative_fails() {
    let data = json!({
        "id": 1,
        "state": -1,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.state");
}

// ============================================================================
// UPDATE CARD PROGRESS - STABILITY
// ============================================================================

#[test]
fn test_update_card_progress_stability_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 0.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_stability_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": -1.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.stability"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - DIFFICULTY
// ============================================================================

#[test]
fn test_update_card_progress_difficulty_min_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 0.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_difficulty_max_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 10.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_difficulty_below_min_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": -0.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}

#[test]
fn test_update_card_progress_difficulty_above_max_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 10.1,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.difficulty"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - SCHEDULED DAYS
// ============================================================================

#[test]
fn test_update_card_progress_scheduled_days_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_scheduled_days_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": -1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.scheduled-days"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - LEARNING STEPS
// ============================================================================

#[test]
fn test_update_card_progress_learning_steps_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_learning_steps_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": -1,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(
        validation_result.unwrap_err().code,
        "validation.cards-progress.learning-steps"
    );
}

// ============================================================================
// UPDATE CARD PROGRESS - REPS
// ============================================================================

#[test]
fn test_update_card_progress_reps_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_reps_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": -1,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.reps");
}

// ============================================================================
// UPDATE CARD PROGRESS - LAPSES
// ============================================================================

#[test]
fn test_update_card_progress_lapses_zero_ok() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_card_progress_lapses_negative_fails() {
    let data = json!({
        "id": 1,
        "state": 0,
        "dueAt": 1000000000,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 1,
        "learningSteps": 0,
        "reps": 0,
        "lapses": -1
    });
    let result = serde_json::from_value::<UpdateCardProgress>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.cards-progress.lapses");
}
