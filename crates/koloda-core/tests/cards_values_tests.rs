mod common;

use common::{
    empty_optional_field_content, empty_required_field_content, missing_optional_field_content,
    missing_required_field_content, valid_card_content, valid_template_fields,
};
use koloda_core::domain::cards::UpdateCardValues;
use serde_json::json;

// ============================================================================
// UPDATE CARD VALUES - MISSING FIELDS
// ============================================================================

#[test]
fn test_update_card_values_missing_content() {
    let data = json!({});
    let result = serde_json::from_value::<UpdateCardValues>(data);
    result.unwrap_err();
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
    result.unwrap();
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
    result.unwrap_err();
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
    result.unwrap_err();
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
    let values = result.unwrap();
    values.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_update_card_content_required_field_empty_fails() {
    let data = json!({
        "content": empty_required_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
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
    let values = result.unwrap();
    let validation_result = values.validate(&valid_template_fields());
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
    let values = result.unwrap();
    values.validate(&valid_template_fields()).unwrap();
}

#[test]
fn test_update_card_content_optional_field_missing_ok() {
    let data = json!({
        "content": missing_optional_field_content()
    });
    let result = serde_json::from_value::<UpdateCardValues>(data);
    let values = result.unwrap();
    values.validate(&valid_template_fields()).unwrap();
}
