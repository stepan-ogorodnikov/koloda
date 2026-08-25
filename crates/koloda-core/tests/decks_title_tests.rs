use koloda_core::domain::decks::InsertDeckData;
use serde_json::json;

// ============================================================================
// DECK TITLE BOUNDARIES
// ============================================================================

#[test]
fn test_insert_deck_empty_title_fails() {
    let data = json!({
        "title": "",
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    let validation_result = result.unwrap().validate();
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
    result.unwrap().validate().unwrap();
}
