use koloda_native_tauri::domain::decks::{InsertDeckData, UpdateDeckData, UpdateDeckValues};
use serde_json::json;

// ============================================================================
// INSERT DECK DATA - MISSING FIELDS
// ============================================================================

#[test]
fn test_insert_deck_missing_title() {
    let data = json!({
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_err());
}

#[test]
fn test_insert_deck_missing_algorithm_id() {
    let data = json!({
        "title": "My Deck",
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_err());
}

#[test]
fn test_insert_deck_missing_template_id() {
    let data = json!({
        "title": "My Deck",
        "algorithmId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_err());
}

// ============================================================================
// INSERT DECK DATA - EXTRA FIELDS
// ============================================================================

#[test]
fn test_insert_deck_extra_fields_ok() {
    let data = json!({
        "title": "My Deck",
        "algorithmId": 1,
        "templateId": 1,
        "unknownField": "ignored",
        "createdAt": 1234567890
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
}

// ============================================================================
// INSERT DECK DATA - INVALID TYPES
// ============================================================================

#[test]
fn test_insert_deck_title_invalid_type() {
    let data = json!({
        "title": 123,
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_err());
}

#[test]
fn test_insert_deck_algorithm_id_invalid_type() {
    let data = json!({
        "title": "My Deck",
        "algorithmId": "not-a-number",
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_err());
}

#[test]
fn test_insert_deck_template_id_invalid_type() {
    let data = json!({
        "title": "My Deck",
        "algorithmId": 1,
        "templateId": "not-a-number"
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_err());
}

// ============================================================================
// INSERT DECK DATA - TITLE VALIDATION
// ============================================================================

#[test]
fn test_insert_deck_valid_title() {
    let data = json!({
        "title": "My Deck",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_insert_deck_empty_title_fails() {
    let data = json!({
        "title": "",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.common.title.too-short");
}

#[test]
fn test_insert_deck_title_max_length_ok() {
    let data = json!({
        "title": "a".repeat(255),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_insert_deck_title_exceeds_max_length_fails() {
    let data = json!({
        "title": "a".repeat(256),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.common.title.too-long");
}

#[test]
fn test_insert_deck_unicode_title_ok() {
    let data = json!({
        "title": "Колода карточек 🎴",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_insert_deck_single_char_title_ok() {
    let data = json!({
        "title": "A",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

// ============================================================================
// UPDATE DECK VALUES - MISSING FIELDS
// ============================================================================

#[test]
fn test_update_deck_values_missing_title() {
    let data = json!({
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE DECK VALUES - EXTRA FIELDS
// ============================================================================

#[test]
fn test_update_deck_values_extra_fields_ok() {
    let data = json!({
        "title": "Updated Deck",
        "algorithmId": 2,
        "templateId": 2,
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_ok());
}

// ============================================================================
// UPDATE DECK VALUES - INVALID TYPES
// ============================================================================

#[test]
fn test_update_deck_values_title_invalid_type() {
    let data = json!({
        "title": 123,
        "algorithmId": 2,
        "templateId": 2
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_deck_values_algorithm_id_invalid_type() {
    let data = json!({
        "title": "Updated Deck",
        "algorithmId": "not-a-number",
        "templateId": 2
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_deck_values_template_id_invalid_type() {
    let data = json!({
        "title": "Updated Deck",
        "algorithmId": 2,
        "templateId": "not-a-number"
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE DECK VALUES - TITLE VALIDATION
// ============================================================================

#[test]
fn test_update_deck_valid_title() {
    let data = json!({
        "title": "Updated Deck",
        "algorithmId": 2,
        "templateId": 2
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_deck_empty_title_fails() {
    let data = json!({
        "title": "",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.common.title.too-short");
}

#[test]
fn test_update_deck_title_max_length_ok() {
    let data = json!({
        "title": "a".repeat(255),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

#[test]
fn test_update_deck_title_exceeds_max_length_fails() {
    let data = json!({
        "title": "a".repeat(256),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_ok());
    let validation_result = result.unwrap().validate();
    assert!(validation_result.is_err());
    assert_eq!(validation_result.unwrap_err().code, "validation.common.title.too-long");
}

#[test]
fn test_update_deck_unicode_title_ok() {
    let data = json!({
        "title": "更新されたデッキ 📚",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<UpdateDeckValues>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().validate().is_ok());
}

// ============================================================================
// UPDATE DECK DATA - MISSING FIELDS
// ============================================================================

#[test]
fn test_update_deck_data_missing_id() {
    let data = json!({
        "values": {
            "title": "Updated Deck",
            "algorithmId": 2,
            "templateId": 2
        }
    });
    let result = serde_json::from_value::<UpdateDeckData>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_deck_data_missing_values() {
    let data = json!({
        "id": 1
    });
    let result = serde_json::from_value::<UpdateDeckData>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE DECK DATA - EXTRA FIELDS
// ============================================================================

#[test]
fn test_update_deck_data_extra_fields_ok() {
    let data = json!({
        "id": 1,
        "values": {
            "title": "Updated Deck",
            "algorithmId": 2,
            "templateId": 2
        },
        "unknownField": "ignored"
    });
    let result = serde_json::from_value::<UpdateDeckData>(data);
    assert!(result.is_ok());
}

// ============================================================================
// UPDATE DECK DATA - INVALID TYPES
// ============================================================================

#[test]
fn test_update_deck_data_id_invalid_type() {
    let data = json!({
        "id": "not-a-number",
        "values": {
            "title": "Updated Deck",
            "algorithmId": 2,
            "templateId": 2
        }
    });
    let result = serde_json::from_value::<UpdateDeckData>(data);
    assert!(result.is_err());
}

#[test]
fn test_update_deck_data_values_invalid_type() {
    let data = json!({
        "id": 1,
        "values": "not-an-object"
    });
    let result = serde_json::from_value::<UpdateDeckData>(data);
    assert!(result.is_err());
}

// ============================================================================
// UPDATE DECK DATA - VALID
// ============================================================================

#[test]
fn test_update_deck_data_valid() {
    let data = json!({
        "id": 1,
        "values": {
            "title": "Updated Deck",
            "algorithmId": 2,
            "templateId": 2
        }
    });
    let result = serde_json::from_value::<UpdateDeckData>(data);
    assert!(result.is_ok());
    assert!(result.unwrap().values.validate().is_ok());
}
