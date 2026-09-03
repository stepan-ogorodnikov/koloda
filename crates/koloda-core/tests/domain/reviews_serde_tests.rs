use koloda_core::domain::reviews::InsertReviewData;
use serde_json::{json, Value};

/// Canonical valid review-insert payload used as the mutation base for JSON-shape contract cases.
fn valid_payload() -> Value {
    json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "stability": 5.0,
        "difficulty": 5.0,
        "scheduledDays": 0,
        "learningSteps": 0,
        "time": 0,
        "isIgnored": false
    })
}

#[test]
fn test_missing_required_fields_fail() {
    let required_fields = [
        "cardId",
        "rating",
        "state",
        "stability",
        "difficulty",
        "scheduledDays",
        "learningSteps",
        "time",
        "isIgnored",
    ];

    for field in required_fields {
        let mut payload = valid_payload();
        payload.as_object_mut().unwrap().remove(field);

        let result: Result<InsertReviewData, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is missing");
    }

    let result: Result<InsertReviewData, _> = serde_json::from_value(json!({}));
    assert!(result.is_err(), "Should fail when every field is missing");

    // WHY: only `dueAt` carries an explicit `#[serde(default)]`,
    // so absence must deserialize to `None` instead of failing.
    let data: InsertReviewData = serde_json::from_value(valid_payload()).expect("`dueAt` should default when absent");
    assert_eq!(data.due_at, None);
}

#[test]
fn test_wrong_typed_fields_fail() {
    // WHY: Unknown fields carry no declared type and are tolerated (no `deny_unknown_fields`),
    // so extra members must never reject an otherwise valid payload.
    let mut payload = valid_payload();
    payload["dueAt"] = json!(null);
    payload["unknownField"] = json!("ignored");

    let data: InsertReviewData = serde_json::from_value(payload).expect("Should deserialize ignoring extra fields");
    assert_eq!(data.due_at, None);
    data.validate().unwrap();

    // `dueAt` tolerates `null` and ISO 8601 strings (`deserialize_optional_timestamp`),
    // so only a non-ISO string must reject.
    let mistyped_fields = [
        ("cardId", json!("not-a-number")),
        ("cardId", json!(null)),
        ("rating", json!("not-a-number")),
        ("rating", json!(null)),
        ("state", json!("not-a-number")),
        ("state", json!(null)),
        ("dueAt", json!("not-a-timestamp")),
        ("stability", json!("not-a-number")),
        ("stability", json!(null)),
        ("difficulty", json!("not-a-number")),
        ("difficulty", json!(null)),
        ("scheduledDays", json!("not-a-number")),
        ("scheduledDays", json!(null)),
        ("learningSteps", json!("not-a-number")),
        ("learningSteps", json!(null)),
        ("time", json!("not-a-number")),
        ("time", json!(null)),
        ("isIgnored", json!("not-a-bool")),
        ("isIgnored", json!(null)),
    ];

    for (field, offending) in mistyped_fields {
        let mut payload = valid_payload();
        payload[field] = offending.clone();

        let result: Result<InsertReviewData, _> = serde_json::from_value(payload);
        assert!(result.is_err(), "Should fail when {field} is {offending}");
    }
}
