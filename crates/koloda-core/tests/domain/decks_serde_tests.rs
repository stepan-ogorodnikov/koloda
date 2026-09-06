use koloda_core::domain::decks::{Deck, InsertDeckData, UpdateDeckData};
use serde_json::json;

fn deck_fixture() -> Deck {
    Deck {
        id: 5,
        title: "German".to_string(),
        algorithm_id: 1,
        template_id: 2,
        created_at: 1_699_999_000_000,
        updated_at: Some(1_700_000_400_000),
    }
}

/// Pins the exact JSON the NAPI layer hands the renderer for a deck row:
/// camelCase keys, timestamps as RFC 3339 strings.
#[test]
fn test_deck_serializes_wire_shape() {
    let value = serde_json::to_value(deck_fixture()).unwrap();

    assert_eq!(
        value,
        json!({
            "id": 5,
            "title": "German",
            "algorithmId": 1,
            "templateId": 2,
            "createdAt": "2023-11-14T21:56:40+00:00",
            "updatedAt": "2023-11-14T22:20:00+00:00",
        })
    );
}

/// WHY: `updatedAt` is `null`, not omitted, when unset.
#[test]
fn test_deck_serializes_null_updated_at() {
    let mut deck = deck_fixture();
    deck.updated_at = None;

    let value = serde_json::to_value(&deck).unwrap();

    assert_eq!(value["updatedAt"], serde_json::Value::Null);
    assert_eq!(value.as_object().unwrap().len(), 6, "key set must not change");
}

#[test]
fn test_deck_json_round_trips() {
    let value = serde_json::to_value(&deck_fixture()).unwrap();

    let back: Deck = serde_json::from_value(value).unwrap();

    assert_eq!(back, deck_fixture());
}

#[test]
fn test_deck_input_shapes() {
    // All three insert fields are non-Option: presence is required.
    let payload = json!({ "title": "German", "algorithmId": 1, "templateId": 2 });
    for field in ["title", "algorithmId", "templateId"] {
        let mut missing = payload.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<InsertDeckData>(missing).is_err(),
            "{field} is required"
        );
    }
    serde_json::from_value::<InsertDeckData>(payload).expect("canonical insert payload should deserialize");

    // The update `values` envelope is required as a whole.
    assert!(serde_json::from_value::<UpdateDeckData>(json!({ "id": 5 })).is_err());
    assert!(
        serde_json::from_value::<UpdateDeckData>(json!({ "id": 5, "values": { "title": "x" } })).is_err(),
        "values needs algorithmId and templateId too"
    );
}
