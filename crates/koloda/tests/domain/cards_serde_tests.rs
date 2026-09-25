use koloda::domain::cards::{
    AddCardsItemError, AddCardsItemResult, Card, CardContentField, InsertCardData, UpdateCardData, UpdateCardValues,
};
use serde_json::{json, Value};

/// Full-field card used as the base for wire-shape and round-trip pins.
fn card_fixture() -> Card {
    Card {
        id: "01900000-0000-7000-8000-00000000002a".to_string(),
        deck_id: "01900000-0000-7000-8000-000000000007".to_string(),
        template_id: "01900000-0000-7000-8000-000000000003".to_string(),
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
        stability: 12.5,
        difficulty: 4.75,
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
            "id": "01900000-0000-7000-8000-00000000002a",
            "deckId": "01900000-0000-7000-8000-000000000007",
            "templateId": "01900000-0000-7000-8000-000000000003",
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
/// `stability`/`difficulty` are numbers (untouched is `0`), never JSON null.
#[test]
fn test_card_serializes_null_optional_fields() {
    let mut card = card_fixture();
    card.due_at = None;
    card.last_reviewed_at = None;
    card.updated_at = None;

    let value = serde_json::to_value(&card).unwrap();

    for key in ["dueAt", "lastReviewedAt", "updatedAt"] {
        assert_eq!(value.get(key), Some(&Value::Null), "{key} must be present and null");
    }
    assert_eq!(value.get("stability"), Some(&json!(12.5)));
    assert_eq!(value.get("difficulty"), Some(&json!(4.75)));
    assert_eq!(value.as_object().unwrap().len(), 15, "key set must not change");
}

#[test]
fn test_card_rejects_null_stability_and_difficulty() {
    let value = serde_json::to_value(card_fixture()).unwrap();

    for key in ["stability", "difficulty"] {
        let mut payload = value.clone();
        payload[key] = json!(null);
        assert!(
            serde_json::from_value::<Card>(payload).is_err(),
            "{key}: JSON null must fail (twin of z.number())"
        );
    }
}

#[test]
fn test_card_deserializes_omitted_stability_and_difficulty_as_zero() {
    let mut omitted = serde_json::to_value(card_fixture()).unwrap();
    omitted.as_object_mut().unwrap().remove("stability");
    omitted.as_object_mut().unwrap().remove("difficulty");
    let card: Card = serde_json::from_value(omitted).expect("omitted keys default to 0");
    assert!(
        card.stability.abs() < f64::EPSILON,
        "omitted stability should default to 0, got {}",
        card.stability
    );
    assert!(
        card.difficulty.abs() < f64::EPSILON,
        "omitted difficulty should default to 0, got {}",
        card.difficulty
    );
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
        "deckId": "01900000-0000-7000-8000-000000000007",
        "templateId": "01900000-0000-7000-8000-000000000003",
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

/// One row per shape class on `InsertCardData`. Option fields stay absent-or-null → `None`.
#[test]
fn test_insert_card_data_input_shapes() {
    // WHY: serde treats every `Option` field as implicitly optional, so only
    // deckId, templateId, and content require presence.
    let reject: &[(&str, &str, Option<Value>)] = &[
        ("missing deckId", "deckId", None),
        ("mistyped content", "content", Some(json!("not-an-object"))),
        ("null templateId", "templateId", Some(json!(null))),
    ];

    for (label, field, offending) in reject {
        let mut payload = valid_insert_payload();
        match offending {
            None => {
                payload.as_object_mut().unwrap().remove(*field);
            }
            Some(value) => payload[*field] = value.clone(),
        }
        assert!(
            serde_json::from_value::<InsertCardData>(payload).is_err(),
            "{label} must fail"
        );
    }

    let mut extra = valid_insert_payload();
    extra["unknownField"] = json!("ignored");
    serde_json::from_value::<InsertCardData>(extra).expect("extra fields must be tolerated");

    let mut absent = valid_insert_payload();
    for field in [
        "state",
        "stability",
        "difficulty",
        "scheduledDays",
        "learningSteps",
        "reps",
        "lapses",
        "dueAt",
        "lastReviewedAt",
    ] {
        absent.as_object_mut().unwrap().remove(field);
    }
    let data: InsertCardData =
        serde_json::from_value(absent).expect("optional fields should default to None when absent");
    assert_eq!(data.state, None);
    assert_eq!(data.due_at, None);
    assert_eq!(data.last_reviewed_at, None);

    let mut null_state = valid_insert_payload();
    null_state["state"] = json!(null);
    let data: InsertCardData = serde_json::from_value(null_state).expect("null state should deserialize to None");
    assert_eq!(data.state, None);
}

#[test]
fn test_update_card_values_input_shapes() {
    let content = json!({ "1": { "text": "front" }, "2": { "text": "back" } });
    let cases: &[(&str, Value, bool)] = &[
        ("missing content", json!({}), false),
        (
            "extra field",
            json!({ "content": content, "unknownField": "ignored" }),
            true,
        ),
        ("content wrong type", json!({ "content": "not-an-object" }), false),
        (
            "nested text wrong type",
            json!({ "content": { "1": { "text": 123 }, "2": { "text": "Back text" } } }),
            false,
        ),
    ];

    for (label, payload, ok) in cases {
        let result = serde_json::from_value::<UpdateCardValues>(payload.clone());
        assert_eq!(result.is_ok(), *ok, "{label}");
    }
}

#[test]
fn test_update_card_data_wire_envelope() {
    let data: UpdateCardData = serde_json::from_value(json!({
        "id": "01900000-0000-7000-8000-000000000005",
        "values": { "content": { "1": { "text": "updated" } } },
    }))
    .expect("canonical update payload should deserialize");
    assert_eq!(data.id, "01900000-0000-7000-8000-000000000005");
    assert_eq!(data.values.content["1"].text, "updated");

    // The `values` envelope is required as a whole.
    serde_json::from_value::<UpdateCardData>(json!({ "id": "01900000-0000-7000-8000-000000000005" })).unwrap_err();
    serde_json::from_value::<UpdateCardData>(json!({ "id": "01900000-0000-7000-8000-000000000005", "values": {} }))
        .unwrap_err();
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
