use koloda_core::domain::conversations::Conversation;
use serde_json::json;

// ============================================================================
// SERIALIZATION (camelCase)
// ============================================================================

#[test]
fn test_conversation_serialization_uses_camel_case_keys() {
    let conversation = Conversation {
        id: "conv-1".to_string(),
        state: json!({"messages": []}),
        created_at: 1_700_000_000_000,
        updated_at: Some(1_700_000_001_000),
    };

    let serialized = serde_json::to_value(&conversation).expect("conversation should serialize");
    let obj = serialized.as_object().expect("serialized value should be an object");

    assert!(obj.contains_key("id"), "missing camelCase key 'id'");
    assert!(obj.contains_key("state"), "missing camelCase key 'state'");
    assert!(obj.contains_key("createdAt"), "missing camelCase key 'createdAt'");
    assert!(obj.contains_key("updatedAt"), "missing camelCase key 'updatedAt'");
    assert!(
        !obj.contains_key("created_at"),
        "snake_case key 'created_at' leaked into output"
    );
    assert!(
        !obj.contains_key("updated_at"),
        "snake_case key 'updated_at' leaked into output"
    );
}

#[test]
fn test_conversation_serialization_renders_timestamps_as_iso_strings() {
    let conversation = Conversation {
        id: "conv-1".to_string(),
        state: json!({}),
        created_at: 1_700_000_000_000,
        updated_at: Some(1_700_000_001_000),
    };

    let serialized = serde_json::to_value(&conversation).expect("conversation should serialize");

    let created_at = serialized
        .get("createdAt")
        .and_then(|v| v.as_str())
        .expect("createdAt should be a string");
    let updated_at = serialized
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .expect("updatedAt should be a string");

    assert!(
        chrono::DateTime::parse_from_rfc3339(created_at).is_ok(),
        "createdAt is not a valid RFC3339 string: {}",
        created_at
    );
    assert!(
        chrono::DateTime::parse_from_rfc3339(updated_at).is_ok(),
        "updatedAt is not a valid RFC3339 string: {}",
        updated_at
    );
}

#[test]
fn test_conversation_serialization_renders_null_updated_at_when_absent() {
    let conversation = Conversation {
        id: "conv-1".to_string(),
        state: json!({}),
        created_at: 1_700_000_000_000,
        updated_at: None,
    };

    let serialized = serde_json::to_value(&conversation).expect("conversation should serialize");

    assert!(
        serialized.get("updatedAt").map(|v| v.is_null()).unwrap_or(false),
        "updatedAt should be serialized as null when None"
    );
}

#[test]
fn test_conversation_serialization_preserves_state_payload() {
    let state = json!({
        "messages": [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
        "metadata": {"model": "test", "tokens": 42},
    });
    let conversation = Conversation {
        id: "conv-1".to_string(),
        state: state.clone(),
        created_at: 1_700_000_000_000,
        updated_at: None,
    };

    let serialized = serde_json::to_value(&conversation).expect("conversation should serialize");
    assert_eq!(serialized.get("state"), Some(&state));
}

// ============================================================================
// DESERIALIZATION
// ============================================================================

#[test]
fn test_conversation_deserialization_from_camel_case() {
    let data = json!({
        "id": "conv-1",
        "state": {"messages": []},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": 1_700_000_001_000_i64,
    });

    let conversation: Conversation = serde_json::from_value(data).expect("conversation should deserialize");

    assert_eq!(conversation.id, "conv-1");
    assert_eq!(conversation.state, json!({"messages": []}));
    assert_eq!(conversation.created_at, 1_700_000_000_000);
    assert_eq!(conversation.updated_at, Some(1_700_000_001_000));
}

#[test]
fn test_conversation_deserialization_accepts_iso_string_for_updated_at() {
    // ISO strings on the wire are accepted, matching what the serializer
    // emits and the convention used by sibling domain types.
    let updated_at = chrono::DateTime::from_timestamp_millis(1_700_000_001_000)
        .expect("timestamp should be valid")
        .to_rfc3339();

    let data = json!({
        "id": "conv-1",
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": updated_at,
    });

    let conversation: Conversation =
        serde_json::from_value(data).expect("ISO string for updated_at should deserialize");
    assert_eq!(conversation.updated_at, Some(1_700_000_001_000));
}

#[test]
fn test_conversation_deserialization_accepts_iso_string_for_created_at() {
    let created_at = chrono::DateTime::from_timestamp_millis(1_700_000_000_000)
        .expect("timestamp should be valid")
        .to_rfc3339();

    let data = json!({
        "id": "conv-1",
        "state": {},
        "createdAt": created_at,
        "updatedAt": null,
    });

    let conversation: Conversation =
        serde_json::from_value(data).expect("ISO string for created_at should deserialize");
    assert_eq!(conversation.created_at, 1_700_000_000_000);
}

#[test]
fn test_conversation_deserialization_missing_created_at_uses_default() {
    let data = json!({
        "id": "conv-1",
        "state": {},
        "updatedAt": null,
    });

    let conversation: Conversation =
        serde_json::from_value(data).expect("conversation should deserialize with default createdAt");

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock should be after unix epoch")
        .as_millis() as i64;

    // default_now is "now-ish"; allow generous skew for slow test runners.
    let skew = (conversation.created_at - now).abs();
    assert!(
        skew < 5_000,
        "default createdAt should be approximately now, got {} (delta {})",
        conversation.created_at,
        skew
    );
}

#[test]
fn test_conversation_deserialization_missing_updated_at_is_none() {
    let data = json!({
        "id": "conv-1",
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
    });

    let conversation: Conversation =
        serde_json::from_value(data).expect("conversation should deserialize with optional updatedAt");

    assert!(conversation.updated_at.is_none());
}

#[test]
fn test_conversation_deserialization_explicit_null_updated_at_is_none() {
    let data = json!({
        "id": "conv-1",
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
    });

    let conversation: Conversation =
        serde_json::from_value(data).expect("conversation should deserialize null updatedAt");

    assert!(conversation.updated_at.is_none());
}

#[test]
fn test_conversation_deserialization_invalid_updated_at_string_fails() {
    let data = json!({
        "id": "conv-1",
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": "not-a-timestamp",
    });

    let result = serde_json::from_value::<Conversation>(data);
    assert!(result.is_err(), "invalid updatedAt string should fail deserialization");
}

#[test]
fn test_conversation_deserialization_state_accepts_string_payload() {
    let data = json!({
        "id": "conv-1",
        "state": "raw-string-state",
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
    });

    let conversation: Conversation =
        serde_json::from_value(data).expect("state is serde_json::Value and accepts any JSON type");

    assert_eq!(conversation.state, json!("raw-string-state"));
}

#[test]
fn test_conversation_deserialization_state_accepts_arbitrary_json() {
    let data = json!({
        "id": "conv-1",
        "state": [
            1,
            2,
            3,
            {"nested": [true, null, "x"]}
        ],
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
    });

    let conversation: Conversation = serde_json::from_value(data).expect("state should accept arbitrary JSON values");

    assert_eq!(conversation.state, json!([1, 2, 3, {"nested": [true, null, "x"]}]));
}

#[test]
fn test_conversation_deserialization_missing_id_fails() {
    let data = json!({
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
    });

    let result = serde_json::from_value::<Conversation>(data);
    assert!(result.is_err(), "missing id should fail deserialization");
}

#[test]
fn test_conversation_deserialization_missing_state_fails() {
    let data = json!({
        "id": "conv-1",
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
    });

    let result = serde_json::from_value::<Conversation>(data);
    assert!(result.is_err(), "missing state should fail deserialization");
}

// ============================================================================
// EXTRA FIELDS
// ============================================================================

#[test]
fn test_conversation_deserialization_ignores_extra_fields() {
    let data = json!({
        "id": "conv-1",
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
        "unknownField": "ignored",
        "anotherUnknown": 42,
    });

    let conversation: Conversation = serde_json::from_value(data).expect("extra fields should be ignored");

    assert_eq!(conversation.id, "conv-1");
    assert_eq!(conversation.state, json!({}));
}

// ============================================================================
// ROUND TRIP
// ============================================================================

#[test]
fn test_conversation_round_trip_preserves_state() {
    let original = Conversation {
        id: "conv-1".to_string(),
        state: json!({
            "messages": [
                {"role": "user", "content": "What is Rust?"},
                {"role": "assistant", "content": "A systems programming language."},
            ],
            "version": 1,
            "draft": null,
        }),
        created_at: 1_700_000_000_000,
        updated_at: Some(1_700_000_005_000),
    };

    // Real round trip: serialize via the actual serializer, then normalize
    // the timestamp fields to numeric form (the on-the-wire contract) and
    // deserialize. Catches schema drift in keys, structure, and defaults.
    let serialized = serde_json::to_value(&original).expect("serialize");
    let mut wire = serialized;
    wire["createdAt"] = json!(original.created_at);
    wire["updatedAt"] = json!(original.updated_at);

    let restored: Conversation = serde_json::from_value(wire).expect("deserialize");
    assert_eq!(restored.id, original.id);
    assert_eq!(restored.state, original.state);
    assert_eq!(restored.created_at, original.created_at);
    assert_eq!(restored.updated_at, original.updated_at);
}

#[test]
fn test_conversation_round_trip_with_null_updated_at() {
    let original = Conversation {
        id: "conv-2".to_string(),
        state: json!({}),
        created_at: 1_700_000_000_000,
        updated_at: None,
    };

    let serialized = serde_json::to_value(&original).expect("serialize");
    let mut wire = serialized;
    wire["createdAt"] = json!(original.created_at);
    wire["updatedAt"] = json!(null);

    let restored: Conversation = serde_json::from_value(wire).expect("deserialize");
    assert_eq!(restored.id, original.id);
    assert_eq!(restored.state, original.state);
    assert_eq!(restored.created_at, original.created_at);
    assert_eq!(restored.updated_at, original.updated_at);
}

#[test]
fn test_conversation_round_trip_via_iso_strings() {
    // The serializer emits ISO strings; with the symmetric deserializer,
    // the serialized output round-trips back into a Conversation cleanly.
    let original = Conversation {
        id: "conv-1".to_string(),
        state: json!({"k": "v"}),
        created_at: 1_700_000_000_000,
        updated_at: Some(1_700_000_005_000),
    };

    let serialized = serde_json::to_value(&original).expect("serialize");
    assert!(serialized["createdAt"].is_string(), "createdAt serializes as ISO string");
    assert!(serialized["updatedAt"].is_string(), "updatedAt serializes as ISO string");

    let restored: Conversation = serde_json::from_value(serialized).expect("serialized form should round-trip");
    assert_eq!(restored.id, original.id);
    assert_eq!(restored.state, original.state);
    assert_eq!(restored.created_at, original.created_at);
    assert_eq!(restored.updated_at, original.updated_at);
}
