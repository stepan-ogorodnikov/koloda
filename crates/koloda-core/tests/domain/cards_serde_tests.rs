use koloda_core::domain::cards::{
    AddCardsItemError, AddCardsItemResult, Card, CardContentField, InsertCardData, UpdateCardData,
};
use serde_json::{json, Value};

/// Full-field card used as the base for wire-shape and round-trip pins.
fn card_fixture() -> Card {
    Card {
        id: 42,
        deck_id: 7,
        template_id: 3,
        content: [
            (
                "1".to_string(),
                CardContentField {
                    text: "front".to_string(),
                },
            ),
            (
                "2".to_string(),
                CardContentField {
                    text: "back".to_string(),
                },
            ),
        ]
        .into_iter()
        .collect(),
        state: 2,
        due_at: Some(1_700_000_000_000),
        stability: Some(12.5),
        difficulty: Some(4.75),
        scheduled_days: 9,
        learning_steps: 1,
        reps: 3,
        lapses: 1,
        last_reviewed_at: Some(1_699_999_400_000),
        created_at: 1_699_999_000_000,
        updated_at: Some(1_700_000_400_000),
    }
}

/// Pins the exact JSON the NAPI layer hands the renderer for a card row:
/// camelCase keys, content keyed by template-field id, and all timestamps as
/// RFC 3339 strings — not the i64 millis the struct stores. Mirrored by
/// `Card` in `@koloda/srs`.
#[test]
fn test_card_serializes_wire_shape() {
    let value = serde_json::to_value(card_fixture()).unwrap();

    assert_eq!(
        value,
        json!({
            "id": 42,
            "deckId": 7,
            "templateId": 3,
            "content": { "1": { "text": "front" }, "2": { "text": "back" } },
            "state": 2,
            "dueAt": "2023-11-14T22:13:20+00:00",
            "stability": 12.5,
            "difficulty": 4.75,
            "scheduledDays": 9,
            "learningSteps": 1,
            "reps": 3,
            "lapses": 1,
            "lastReviewedAt": "2023-11-14T22:03:20+00:00",
            "createdAt": "2023-11-14T21:56:40+00:00",
            "updatedAt": "2023-11-14T22:20:00+00:00",
        })
    );
}

/// WHY: unset optionals serialize as `null`, not omitted keys.
#[test]
fn test_card_serializes_null_optional_fields() {
    let mut card = card_fixture();
    card.due_at = None;
    card.stability = None;
    card.difficulty = None;
    card.last_reviewed_at = None;
    card.updated_at = None;

    let value = serde_json::to_value(&card).unwrap();

    for key in ["dueAt", "stability", "difficulty", "lastReviewedAt", "updatedAt"] {
        assert_eq!(value.get(key), Some(&Value::Null), "{key} must be present and null");
    }
    assert_eq!(value.as_object().unwrap().len(), 15, "key set must not change");
}

#[test]
fn test_card_json_round_trips() {
    let value = serde_json::to_value(card_fixture()).unwrap();

    let back: Card = serde_json::from_value(value).unwrap();

    assert_eq!(back, card_fixture());
}

/// Canonical valid card-insert payload used as the mutation base for input-shape cases.
fn valid_insert_payload() -> Value {
    json!({
        "deckId": 7,
        "templateId": 3,
        "content": { "1": { "text": "front" } },
        "state": 0,
        "stability": null,
        "difficulty": null,
        "scheduledDays": 0,
        "learningSteps": 0,
        "reps": 0,
        "lapses": 0,
    })
}

#[test]
fn test_insert_card_data_required_fields() {
    // WHY: serde treats every `Option` field as implicitly optional, so only the
    // non-Option keys require presence; the FSRS progress fields and the two
    // timestamps may be absent or `null`, both deserializing to `None`.
    let required_fields = ["deckId", "templateId", "content"];

    for field in required_fields {
        let mut payload = valid_insert_payload();
        payload.as_object_mut().unwrap().remove(field);

        let result: Result<InsertCardData, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is missing");
    }

    let optional_fields = [
        "state",
        "stability",
        "difficulty",
        "scheduledDays",
        "learningSteps",
        "reps",
        "lapses",
        "dueAt",
        "lastReviewedAt",
    ];
    let mut payload = valid_insert_payload();
    for field in optional_fields {
        payload.as_object_mut().unwrap().remove(field);
    }
    let data: InsertCardData =
        serde_json::from_value(payload).expect("optional fields should default to None when absent");
    assert_eq!(data.state, None);
    assert_eq!(data.due_at, None);
    assert_eq!(data.last_reviewed_at, None);

    // Nullable-but-present: `state: null` also deserializes to `None`.
    let mut payload = valid_insert_payload();
    payload["state"] = json!(null);
    let data: InsertCardData = serde_json::from_value(payload).expect("null state should deserialize to None");
    assert_eq!(data.state, None);

    let mut payload = valid_insert_payload();
    payload["unknownField"] = json!("ignored");
    serde_json::from_value::<InsertCardData>(payload).expect("extra fields must be tolerated");
}

#[test]
fn test_insert_card_data_wrong_typed_fields_fail() {
    let mistyped_fields = [
        ("deckId", json!("not-a-number")),
        ("templateId", json!(null)),
        ("content", json!("not-an-object")),
        ("content", json!({ "1": "not-a-field" })),
        ("state", json!("not-a-number")),
        ("stability", json!("not-a-number")),
        ("scheduledDays", json!("not-a-number")),
        ("dueAt", json!("not-a-timestamp")),
        ("lastReviewedAt", json!("not-a-timestamp")),
    ];

    for (field, offending) in mistyped_fields {
        let mut payload = valid_insert_payload();
        payload[field] = offending.clone();

        let result: Result<InsertCardData, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is {offending}");
    }
}

#[test]
fn test_update_card_data_wire_envelope() {
    let data: UpdateCardData = serde_json::from_value(json!({
        "id": 5,
        "values": { "content": { "1": { "text": "updated" } } },
    }))
    .expect("canonical update payload should deserialize");
    assert_eq!(data.id, 5);
    assert_eq!(data.values.content["1"].text, "updated");

    // The `values` envelope is required as a whole.
    serde_json::from_value::<UpdateCardData>(json!({ "id": 5 })).unwrap_err();
    serde_json::from_value::<UpdateCardData>(json!({ "id": 5, "values": {} })).unwrap_err();
}

/// Pins the batch-add wire shape: success items serialize as `{}` (no `error`
/// key) and `details` is omitted when absent, so the TS mirror's
/// `InsertCardsResponse = Array<{ error?: … }>` stays truthful.
#[test]
fn test_add_cards_response_serializes_wire_shape() {
    let response = vec![
        AddCardsItemResult { error: None },
        AddCardsItemResult {
            error: Some(AddCardsItemError {
                code: "validation.cards.content.field-empty".to_string(),
                details: None,
            }),
        },
        AddCardsItemResult {
            error: Some(AddCardsItemError {
                code: "db.add".to_string(),
                details: Some("boom".to_string()),
            }),
        },
    ];

    assert_eq!(
        serde_json::to_value(&response).unwrap(),
        json!([
            {},
            { "error": { "code": "validation.cards.content.field-empty" } },
            { "error": { "code": "db.add", "details": "boom" } },
        ])
    );
}
