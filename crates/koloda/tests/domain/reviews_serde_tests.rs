use koloda::domain::reviews::{calculate_todays_review_totals, InsertReviewData, Review, ReviewTotals};
use koloda::domain::settings_learning::{CountedDailyLimit, DailyLimits};
use serde_json::{json, Value};

/// Canonical valid review-insert payload used as the mutation base for JSON-shape contract cases.
fn valid_payload() -> Value {
    json!({
        "cardId": 1,
        "rating": 1,
        "state": 0,
        "dueAt": 1_000_000_000,
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
        "dueAt",
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

    let mut review_json = serde_json::to_value(review_fixture()).unwrap();
    review_json.as_object_mut().unwrap().remove("dueAt");
    let result: Result<Review, _> = serde_json::from_value(review_json);
    assert!(result.is_err(), "Should fail when Review dueAt is missing");
}

#[test]
fn test_wrong_typed_fields_fail() {
    // WHY: Unknown fields carry no declared type and are tolerated (no `deny_unknown_fields`),
    // so extra members must never reject an otherwise valid payload.
    let mut payload = valid_payload();
    payload["unknownField"] = json!("ignored");

    let data: InsertReviewData = serde_json::from_value(payload).expect("Should deserialize ignoring extra fields");
    data.validate().unwrap();

    let mistyped_fields = [
        ("cardId", json!("not-a-number")),
        ("cardId", json!(null)),
        ("rating", json!("not-a-number")),
        ("rating", json!(null)),
        ("state", json!("not-a-number")),
        ("state", json!(null)),
        ("dueAt", json!("not-a-timestamp")),
        ("dueAt", json!(null)),
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

/// Full-field review used as the base for wire-shape and round-trip pins.
fn review_fixture() -> Review {
    Review {
        id: 42,
        card_id: 7,
        rating: 3,
        state: 2,
        due_at: 1_700_000_000_000,
        stability: 12.5,
        difficulty: 4.75,
        scheduled_days: 9,
        learning_steps: 1,
        time: 12_345,
        is_ignored: false,
        created_at: 1_699_999_000_000,
    }
}

/// Pins the exact JSON the NAPI layer hands the renderer for a review row:
/// camelCase keys, and `dueAt`/`createdAt` as RFC 3339 strings — not the i64
/// millis the struct stores. Mirrored by `Review` in `@koloda/srs`.
#[test]
fn test_review_serializes_wire_shape() {
    let value = serde_json::to_value(review_fixture()).unwrap();

    assert_eq!(
        value,
        json!({
            "id": 42,
            "cardId": 7,
            "rating": 3,
            "state": 2,
            "dueAt": "2023-11-14T22:13:20+00:00",
            "stability": 12.5,
            "difficulty": 4.75,
            "scheduledDays": 9,
            "learningSteps": 1,
            "time": 12345,
            "isIgnored": false,
            "createdAt": "2023-11-14T21:56:40+00:00",
        })
    );
}

/// WHY: review `dueAt` is a required timestamp — JSON `null` must fail on both DTOs.
#[test]
fn test_review_rejects_null_due_at() {
    let mut insert_payload = valid_payload();
    insert_payload["dueAt"] = json!(null);
    let insert: Result<InsertReviewData, _> = serde_json::from_value(insert_payload);
    assert!(insert.is_err(), "InsertReviewData must reject JSON null dueAt");

    let mut review_json = serde_json::to_value(review_fixture()).unwrap();
    review_json["dueAt"] = json!(null);
    let review: Result<Review, _> = serde_json::from_value(review_json);
    assert!(review.is_err(), "Review must reject JSON null dueAt");
}

#[test]
fn test_review_json_round_trips() {
    let value = serde_json::to_value(review_fixture()).unwrap();

    let back: Review = serde_json::from_value(value).unwrap();

    assert_eq!(back, review_fixture());
}

/// Pins the totals wire shape, including that `total` arrives as the counted
/// sum (learn + review = 8), not the raw bucket total the repo computed.
#[test]
fn test_todays_review_totals_serializes_wire_shape() {
    let totals = calculate_todays_review_totals(
        ReviewTotals {
            untouched: 2,
            learn: 3,
            review: 5,
            total: 999,
        },
        DailyLimits {
            total: 10,
            untouched: CountedDailyLimit {
                value: 5,
                counts: false,
            },
            learn: CountedDailyLimit {
                value: 20,
                counts: true,
            },
            review: CountedDailyLimit {
                value: 20,
                counts: true,
            },
        },
    );

    let value = serde_json::to_value(&totals).unwrap();

    assert_eq!(
        value,
        json!({
            "dailyLimits": {
                "total": 10,
                "untouched": { "value": 5, "counts": false },
                "learn": { "value": 20, "counts": true },
                "review": { "value": 20, "counts": true },
            },
            "reviewTotals": { "untouched": 2, "learn": 3, "review": 5, "total": 8 },
            "meta": {
                "isUntouchedOverTheLimit": false,
                "isLearnOverTheLimit": false,
                "isReviewOverTheLimit": false,
                "isTotalOverTheLimit": false,
            },
        })
    );
}
