use crate::common::{
    empty_optional_field_content, empty_required_field_content, missing_optional_field_content,
    missing_required_field_content, valid_card_content, valid_template_fields,
};
use koloda_core::domain::cards::InsertCardData;
use serde_json::{json, Value};

/// Canonical valid card-insert payload used as the mutation base for JSON-shape contract cases.
fn valid_payload() -> Value {
    json!({
        "deckId": 1,
        "templateId": 1,
        "content": valid_card_content()
    })
}

// ============================================================================
// INSERT CARD DATA - SERDE SHAPE CONTRACTS
// ============================================================================

#[test]
fn test_missing_required_fields_fail() {
    let required_fields = ["deckId", "templateId", "content"];

    for field in required_fields {
        let mut payload = valid_payload();
        payload.as_object_mut().unwrap().remove(field);

        let result = serde_json::from_value::<InsertCardData>(payload);
        assert!(result.is_err(), "Should fail when {field} is missing");
    }

    let result = serde_json::from_value::<InsertCardData>(json!({}));
    assert!(result.is_err(), "Should fail when every field is missing");

    // WHY: `dueAt` and `lastReviewedAt` carry an explicit `#[serde(default)]`, every other optional
    // member is a plain `Option`, so absent members must materialize as `None` instead of failing.
    let data =
        serde_json::from_value::<InsertCardData>(valid_payload()).expect("Optional fields should default when absent");
    assert_eq!(data.state, None);
    assert_eq!(data.due_at, None);
    assert_eq!(data.last_reviewed_at, None);
}

#[test]
fn test_wrong_typed_fields_fail() {
    // WHY: Unknown fields carry no declared type and are tolerated (no `deny_unknown_fields`),
    // so extra members must never reject an otherwise valid payload.
    let mut payload = valid_payload();
    payload["nonexistent"] = json!("ignored");
    payload["another"] = json!(123);

    serde_json::from_value::<InsertCardData>(payload).expect("Should deserialize ignoring extra fields");

    let mistyped_fields = [
        ("deckId", json!("not-a-number")),
        ("templateId", json!("not-a-number")),
        ("content", json!("not-an-object")),
        // Content values are typed structs (`CardContentField`), so a non-string `text` must reject.
        ("content", json!({"1": { "text": 123 }, "2": { "text": "Back text" }})),
        ("state", json!("not-a-number")),
        ("dueAt", json!("not-a-timestamp")),
        ("stability", json!("not-a-number")),
        ("difficulty", json!("not-a-number")),
        ("scheduledDays", json!("not-a-number")),
        ("learningSteps", json!("not-a-number")),
        ("reps", json!("not-a-number")),
        ("lapses", json!("not-a-number")),
        ("lastReviewedAt", json!("not-a-timestamp")),
    ];

    for (field, offending) in mistyped_fields {
        let mut payload = valid_payload();
        payload[field] = offending.clone();

        let result = serde_json::from_value::<InsertCardData>(payload);
        assert!(result.is_err(), "Should fail when {field} is {offending}");
    }
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
