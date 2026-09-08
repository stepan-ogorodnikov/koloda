use koloda::domain::time::{deserialize_optional_timestamp, deserialize_timestamp, serialize_timestamp};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct RequiredTs {
    #[serde(deserialize_with = "deserialize_timestamp", serialize_with = "serialize_timestamp")]
    ts: i64,
}

#[derive(Debug, PartialEq, Deserialize)]
struct OptionalTs {
    #[serde(deserialize_with = "deserialize_optional_timestamp")]
    ts: Option<i64>,
}

const MS: i64 = 1_700_000_000_000;

fn object_shapes() -> [Value; 3] {
    [
        json!({ "value": MS }),
        json!({ "timestamp": MS }),
        json!({ "time": MS }),
    ]
}

#[test]
fn test_required_and_optional_deserialize_epoch_ms() {
    let required: RequiredTs = serde_json::from_value(json!({ "ts": MS })).unwrap();
    assert_eq!(required.ts, MS);

    let optional: OptionalTs = serde_json::from_value(json!({ "ts": MS })).unwrap();
    assert_eq!(optional.ts, Some(MS));
}

#[test]
fn test_required_truncates_fractional_epoch_ms_toward_zero() {
    let required: RequiredTs = serde_json::from_value(json!({ "ts": 1_700_000_000_000.9 })).unwrap();
    assert_eq!(required.ts, 1_700_000_000_000);
}

#[test]
fn test_required_and_optional_round_trip_rfc3339() {
    let serialized = serde_json::to_value(RequiredTs { ts: MS }).unwrap();
    let rfc3339 = serialized["ts"]
        .as_str()
        .expect("serialize_timestamp must emit an RFC3339 string");

    let required: RequiredTs = serde_json::from_value(json!({ "ts": rfc3339 })).unwrap();
    assert_eq!(required.ts, MS);

    let optional: OptionalTs = serde_json::from_value(json!({ "ts": rfc3339 })).unwrap();
    assert_eq!(optional.ts, Some(MS));
}

// INVARIANT: `{value|timestamp|time}` objects are a Tauri leftover, not on the NAPI wire.
#[test]
fn test_required_rejects_timestamp_objects() {
    for shape in object_shapes() {
        let result: Result<RequiredTs, _> = serde_json::from_value(json!({ "ts": shape }));
        assert!(result.is_err(), "required timestamp must reject object {shape}");
    }
}

// INVARIANT: optional fields must fail on those objects, not silently become `Some(ms)`.
#[test]
fn test_optional_rejects_timestamp_objects() {
    for shape in object_shapes() {
        let result: Result<OptionalTs, _> = serde_json::from_value(json!({ "ts": shape }));
        assert!(
            result.is_err(),
            "optional timestamp must reject object {shape}, not become Some(ms)"
        );
    }
}

#[test]
fn test_optional_null_is_none() {
    let optional: OptionalTs = serde_json::from_value(json!({ "ts": null })).unwrap();
    assert_eq!(optional.ts, None);
}
