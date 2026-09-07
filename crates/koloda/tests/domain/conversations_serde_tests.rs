use koloda::domain::conversations::Conversation;
use serde_json::json;

fn conversation_fixture() -> Conversation {
    Conversation {
        id: "conv-1".to_string(),
        title: Some("Card ideas".to_string()),
        // Opaque TS-owned blob — the pin must prove Rust passes it through verbatim.
        state: json!({ "version": 3, "messages": [{ "role": "user" }], "flags": [true, null] }),
        created_at: 1_699_999_000_000,
        updated_at: Some(1_700_000_400_000),
    }
}

/// Pins the conversation wire shape: the `state` blob crosses untouched,
/// timestamps are RFC 3339 strings, and an absent title serializes as `null`
/// (the key stays).
#[test]
fn test_conversation_serializes_wire_shape() {
    let value = serde_json::to_value(conversation_fixture()).unwrap();

    assert_eq!(
        value,
        json!({
            "id": "conv-1",
            "title": "Card ideas",
            "state": { "version": 3, "messages": [{ "role": "user" }], "flags": [true, null] },
            "createdAt": "2023-11-14T21:56:40+00:00",
            "updatedAt": "2023-11-14T22:20:00+00:00",
        })
    );
}

#[test]
fn test_conversation_serializes_null_title_and_updated_at() {
    let mut conversation = conversation_fixture();
    conversation.title = None;
    conversation.updated_at = None;

    let value = serde_json::to_value(&conversation).unwrap();

    assert_eq!(value["title"], serde_json::Value::Null);
    assert_eq!(value["updatedAt"], serde_json::Value::Null);
    assert_eq!(value.as_object().unwrap().len(), 5, "key set must not change");
}

/// Conversation is already symmetric on both directions — pin that it stays so.
#[test]
fn test_conversation_json_round_trips() {
    let conversation = conversation_fixture();
    let value = serde_json::to_value(&conversation).unwrap();

    let back: Conversation = serde_json::from_value(value).unwrap();

    assert_eq!(back, conversation);
}
