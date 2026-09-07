use koloda::domain::decks::InsertDeckData;
use serde_json::json;

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

#[test]
fn test_insert_deck_title_max_length_in_cyrillic_ok() {
    // 255 Cyrillic chars are 510 UTF-8 bytes — byte counting would reject the
    // title the TS zod mirror (UTF-16 units) accepts.
    let data = json!({
        "title": "ф".repeat(255),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    result.unwrap().validate().unwrap();
}

#[test]
fn test_insert_deck_title_max_length_in_emoji_fails() {
    // 128 emoji are 256 UTF-16 units (2 per astral char) — char counting would
    // accept the title the TS zod mirror (UTF-16 units) rejects.
    let data = json!({
        "title": "🦀".repeat(128),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.common.title.too-long");
}

#[test]
fn test_insert_deck_title_one_past_max_length_fails() {
    let data = json!({
        "title": "ф".repeat(256),
        "algorithmId": 1,
        "templateId": 1
    });
    let result = serde_json::from_value::<InsertDeckData>(data);
    let validation_result = result.unwrap().validate();
    assert_eq!(validation_result.unwrap_err().code, "validation.common.title.too-long");
}
