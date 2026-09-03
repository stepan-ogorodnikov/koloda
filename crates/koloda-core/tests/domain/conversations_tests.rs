use koloda_core::domain::conversations::Conversation;
use koloda_core::repo::conversations::SetConversationInput;
use serde_json::json;

#[test]
fn test_conversation_serialization_uses_camel_case_keys_and_iso_timestamps() {
    // WHY: the wire contract is camelCase keys carrying RFC3339 strings; snake_case leakage or
    // raw epoch numbers on output would break the `@koloda/app` API mirror.
    let conversation = Conversation {
        id: "conv-1".to_string(),
        title: Some("My title".to_string()),
        state: json!({"messages": []}),
        created_at: 1_700_000_000_000,
        updated_at: Some(1_700_000_001_000),
    };

    let serialized = serde_json::to_value(&conversation).expect("conversation should serialize");
    let obj = serialized.as_object().expect("serialized value should be an object");

    for key in ["id", "title", "state", "createdAt", "updatedAt"] {
        assert!(obj.contains_key(key), "missing camelCase key '{key}'");
    }
    assert!(
        !obj.contains_key("created_at"),
        "snake_case key 'created_at' leaked into output"
    );
    assert!(
        !obj.contains_key("updated_at"),
        "snake_case key 'updated_at' leaked into output"
    );

    for field in ["createdAt", "updatedAt"] {
        let rendered = serialized
            .get(field)
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| panic!("{field} should render as a string"));
        assert!(
            chrono::DateTime::parse_from_rfc3339(rendered).is_ok(),
            "{field} is not a valid RFC3339 string: {rendered}"
        );
    }
}

#[test]
fn test_conversation_serialization_renders_none_optionals_as_null() {
    // WHY: TS readers tell `null` apart from an absent key, so both optional fields must render
    // explicit nulls when None (title via the derive, updatedAt via serialize_optional_timestamp's
    // serialize_none) rather than being skipped.
    let conversation = Conversation {
        id: "conv-1".to_string(),
        title: None,
        state: json!({}),
        created_at: 1_700_000_000_000,
        updated_at: None,
    };

    let serialized = serde_json::to_value(&conversation).expect("conversation should serialize");

    for field in ["title", "updatedAt"] {
        assert!(
            serialized.get(field).map(|v| v.is_null()).unwrap_or(false),
            "{field} should be serialized as null when None"
        );
    }
}

#[test]
fn test_conversation_deserialization_from_camel_case() {
    let data = json!({
        "id": "conv-1",
        "title": "My title",
        "state": {"messages": []},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": 1_700_000_001_000_i64,
    });

    let conversation: Conversation = serde_json::from_value(data).expect("conversation should deserialize");

    assert_eq!(conversation.id, "conv-1");
    assert_eq!(conversation.title.as_deref(), Some("My title"));
    assert_eq!(conversation.state, json!({"messages": []}));
    assert_eq!(conversation.created_at, 1_700_000_000_000);
    assert_eq!(conversation.updated_at, Some(1_700_000_001_000));
}

#[test]
fn test_conversation_deserialization_omitted_title_is_none() {
    // Backwards compatibility: rows saved before the title column was
    // added deserialise with title = None rather than failing. Explicit
    // `null` collapses through the same Option handling.
    let data = json!({
        "id": "conv-1",
        "state": {"messages": []},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": 1_700_000_001_000_i64,
    });

    let conversation: Conversation = serde_json::from_value(data).expect("missing title should deserialize as None");

    assert!(conversation.title.is_none());
}

#[test]
fn test_conversation_deserialization_accepts_iso_string_timestamps() {
    // WHY: both timestamp fields share the ISO-string branch of their custom deserializers, so
    // one table pins the RFC3339 accept path for the required and optional sides alike.
    type IsoTimestampRow = (&'static str, i64, fn(&Conversation) -> i64);
    let rows: &[IsoTimestampRow] = &[
        ("createdAt", 1_700_000_000_000, |conversation| conversation.created_at),
        ("updatedAt", 1_700_000_001_000, |conversation| {
            conversation.updated_at.expect("updatedAt should be present")
        }),
    ];

    for &(field, expected_ms, read) in rows {
        let iso = chrono::DateTime::from_timestamp_millis(expected_ms)
            .expect("timestamp should be valid")
            .to_rfc3339();

        let mut data = json!({
            "id": "conv-1",
            "title": null,
            "state": {},
            "createdAt": 1_700_000_000_000_i64,
            "updatedAt": 1_700_000_001_000_i64,
        });
        data[field] = json!(iso);

        let conversation: Conversation =
            serde_json::from_value(data).unwrap_or_else(|err| panic!("{field}: ISO string should deserialize: {err}"));

        assert_eq!(
            read(&conversation),
            expected_ms,
            "{field} should parse the ISO string back to epoch millis"
        );
    }
}

#[test]
fn test_conversation_deserialization_missing_created_at_uses_default() {
    let data = json!({
        "id": "conv-1",
        "title": null,
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
fn test_set_conversation_input_deserialization_accepts_f64_updated_at() {
    let data = json!({
        "id": "conv-1",
        "state": {"messages": []},
        "updatedAt": 1_700_000_001_000_f64,
    });

    let input: SetConversationInput =
        serde_json::from_value(data).expect("f64 updatedAt from JS wire format should deserialize");

    assert_eq!(input.updated_at, Some(1_700_000_001_000));
}

#[test]
fn test_conversation_deserialization_invalid_updated_at_string_fails() {
    let data = json!({
        "id": "conv-1",
        "title": null,
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": "not-a-timestamp",
    });

    let result = serde_json::from_value::<Conversation>(data);
    assert!(result.is_err(), "invalid updatedAt string should fail deserialization");
}

#[test]
fn test_conversation_deserialization_missing_required_field_fails() {
    // WHY: id and state are the only fields without defaults, so dropping either from an
    // otherwise complete payload must reject through the same missing-field path.
    let baseline = json!({
        "id": "conv-1",
        "title": null,
        "state": {},
        "createdAt": 1_700_000_000_000_i64,
        "updatedAt": null,
    });

    for field in ["id", "state"] {
        let mut data = baseline.clone();
        data.as_object_mut()
            .expect("baseline should be an object")
            .remove(field);

        let result = serde_json::from_value::<Conversation>(data);
        assert!(result.is_err(), "missing {field} should fail deserialization");
    }
}

#[test]
fn test_conversation_deserialization_ignores_extra_fields() {
    let data = json!({
        "id": "conv-1",
        "title": null,
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

#[test]
fn test_conversation_round_trip_preserves_state() {
    let original = Conversation {
        id: "conv-1".to_string(),
        title: Some("My title".to_string()),
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
    assert_eq!(restored.title, original.title);
}

#[test]
fn test_conversation_round_trip_with_null_updated_at() {
    let original = Conversation {
        id: "conv-2".to_string(),
        title: None,
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
        title: Some("My title".to_string()),
        state: json!({"k": "v"}),
        created_at: 1_700_000_000_000,
        updated_at: Some(1_700_000_005_000),
    };

    let serialized = serde_json::to_value(&original).expect("serialize");
    assert!(
        serialized["createdAt"].is_string(),
        "createdAt serializes as ISO string"
    );
    assert!(
        serialized["updatedAt"].is_string(),
        "updatedAt serializes as ISO string"
    );

    let restored: Conversation = serde_json::from_value(serialized).expect("serialized form should round-trip");
    assert_eq!(restored.id, original.id);
    assert_eq!(restored.state, original.state);
    assert_eq!(restored.created_at, original.created_at);
    assert_eq!(restored.updated_at, original.updated_at);
    assert_eq!(restored.title, original.title);
}
